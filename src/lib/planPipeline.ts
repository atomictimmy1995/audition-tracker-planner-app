/**
 * Client-side plan orchestration (spec §5.2).
 *
 *   rep lists → canonicalize (edge/model) → overlap (local, deterministic)
 *   → profile → scheduler (local, deterministic) → write_sessions (edge/RAG)
 *   → stored plan rows
 *
 * The scheduler runs on-device: it is pure TS and deterministic, so there is
 * nothing to hide server-side. Only model calls cross the network.
 */

import type { CanonicalizedItem } from '../ai/contracts.ts';
import { generatePlan, type PlanInputs } from '../scheduler/engine.ts';
import { addDays } from '../scheduler/dates.ts';
import type {
  AuditionInput,
  ExcerptInput,
  PlanOutput,
  PracticeProfileInput,
} from '../scheduler/types.ts';
import type {
  AuditionRow,
  ExcerptCardRow,
  ExcerptRow,
  PracticeProfileRow,
  RepListItemRow,
} from './db';
import { supabase } from './supabase';

export { buildMinimumViableSession } from '../scheduler/engine.ts';

export async function canonicalizeRep(
  rawRepText: string,
  instrument = 'harp',
): Promise<CanonicalizedItem[]> {
  const { data, error } = await supabase.functions.invoke('ai', {
    body: { op: 'canonicalize', rawRepText, instrument },
  });
  if (error) throw error;
  return data.items as CanonicalizedItem[];
}

export interface LoadedPlanContext {
  auditions: AuditionRow[];
  repItems: RepListItemRow[];
  cards: ExcerptCardRow[];
  excerpts: ExcerptRow[];
  profile: PracticeProfileRow | null;
}

export async function loadPlanContext(userId: string): Promise<LoadedPlanContext> {
  const [auditions, repItems, cards, excerpts, profile] = await Promise.all([
    supabase.from('auditions').select('*').eq('user_id', userId).neq('status', 'result'),
    supabase.from('rep_list_items').select('*, auditions!inner(user_id)').eq('auditions.user_id', userId),
    supabase.from('excerpt_cards').select('*').eq('user_id', userId),
    supabase.from('excerpts').select('*'),
    supabase.from('practice_profiles').select('*').eq('user_id', userId).maybeSingle(),
  ]);
  const firstError = auditions.error ?? repItems.error ?? cards.error ?? excerpts.error ?? profile.error;
  if (firstError) throw firstError;
  return {
    auditions: (auditions.data ?? []) as AuditionRow[],
    repItems: (repItems.data ?? []) as RepListItemRow[],
    cards: (cards.data ?? []) as ExcerptCardRow[],
    excerpts: (excerpts.data ?? []) as ExcerptRow[],
    profile: profile.data as PracticeProfileRow | null,
  };
}

export function buildPlanInputs(ctx: LoadedPlanContext, today: string): PlanInputs | { missing: string } {
  const dated = ctx.auditions.filter((a) => a.audition_date && a.audition_date > today);
  if (dated.length === 0) return { missing: 'Add at least one upcoming audition with a date.' };
  if (!ctx.profile) return { missing: 'Answer the six practice-profile questions first.' };

  const cardByExcerpt = new Map(ctx.cards.map((c) => [c.excerpt_id, c]));
  const excerptById = new Map(ctx.excerpts.map((e) => [e.id, e]));

  const auditions: AuditionInput[] = dated.map((a) => ({
    id: a.id,
    name: a.name,
    auditionDate: a.audition_date!,
    repExcerptIds: ctx.repItems
      .filter((r) => r.audition_id === a.id && r.excerpt_id)
      .map((r) => r.excerpt_id!),
  }));

  const excerptIds = [...new Set(auditions.flatMap((a) => a.repExcerptIds))];
  const excerpts: ExcerptInput[] = excerptIds.map((id) => {
    const lib = excerptById.get(id);
    const card = cardByExcerpt.get(id);
    return {
      excerptId: id,
      difficulty: (lib?.difficulty ?? 3) as ExcerptInput['difficulty'],
      readiness: card?.readiness ?? 'not_started',
    };
  });

  const profile: PracticeProfileInput = {
    daysPerWeek: ctx.profile.days_per_week,
    sessionMinutes: ctx.profile.session_minutes,
    blackoutDates: ctx.profile.blackout_dates ?? [],
    minimumViableSessionMinutes: ctx.profile.minimum_viable_session,
  };

  return { auditions, excerpts, profile, options: { horizonStart: today } };
}

/**
 * Generate, enrich the first two weeks with model-written content, persist.
 * Later weeks keep deterministic labels and get written lazily — replans are
 * cheap deltas, not full regenerations (spec §5.6).
 */
export async function generateAndStorePlan(userId: string, today: string): Promise<PlanOutput> {
  const ctx = await loadPlanContext(userId);
  const inputs = buildPlanInputs(ctx, today);
  if ('missing' in inputs) throw new Error(inputs.missing);

  const plan = generatePlan(inputs);

  // Model pass C on the near horizon only.
  const enrichUntil = addDays(today, 14);
  const nearSessions = plan.sessions.filter((s) => s.date <= enrichUntil);
  let instructionsBySession = new Map<string, { blocks: { instructions: string }[]; coach_note: string }>();
  try {
    const { data, error } = await supabase.functions.invoke('ai', {
      body: {
        op: 'write',
        input: {
          practiceProfile: {
            warmupRitual: ctx.profile?.warmup_ritual ?? undefined,
            closingRitual: ctx.profile?.closing_ritual ?? undefined,
            timeOfDay: ctx.profile?.time_of_day ?? undefined,
          },
          sessions: nearSessions.map((s) => ({
            sessionId: s.date,
            date: s.date,
            phase: s.phase,
            blocks: s.blocks.map((b) => ({
              kind: b.kind,
              minutes: b.minutes,
              excerptId: b.excerptId,
              phase: b.phase,
            })),
          })),
          knowledge: [], // edge function retrieves ExcerptKnowledge itself
        },
      },
    });
    if (!error && data?.items) {
      instructionsBySession = new Map(
        (data.items as Array<{ session_id: string; blocks: { instructions: string }[]; coach_note: string }>).map(
          (i) => [i.session_id, i],
        ),
      );
    }
  } catch {
    // Model enrichment is additive; the deterministic plan stands on its own.
  }

  const { data: previous } = await supabase
    .from('practice_plans')
    .select('id, version')
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle();
  if (previous) {
    await supabase.from('practice_plans').update({ status: 'superseded' }).eq('id', previous.id);
  }

  const { data: planRow, error: planError } = await supabase
    .from('practice_plans')
    .insert({
      user_id: userId,
      version: (previous?.version ?? 0) + 1,
      horizon_start: today,
      horizon_end: plan.sessions.length > 0 ? plan.sessions[plan.sessions.length - 1].date : today,
      phase_map: plan.phaseMap,
      status: 'active',
    })
    .select('id')
    .single();
  if (planError) throw planError;

  const rows = plan.sessions.map((s) => {
    const written = instructionsBySession.get(s.date);
    return {
      plan_id: planRow.id,
      date: s.date,
      planned_minutes: s.plannedMinutes,
      phase: s.phase,
      blocks: s.blocks.map((b, i) => ({
        ...b,
        instructions: written?.blocks?.[i]?.instructions,
      })),
      status: 'planned',
    };
  });
  const { error: sessionsError } = await supabase.from('planned_sessions').insert(rows);
  if (sessionsError) throw sessionsError;

  return plan;
}
