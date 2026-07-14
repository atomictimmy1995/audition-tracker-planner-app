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
import { replan } from '../scheduler/replan.ts';
import type {
  AdherenceEvent,
  AuditionInput,
  ExcerptInput,
  PlanOutput,
  PracticeProfileInput,
  ReplanResult,
} from '../scheduler/types.ts';
import type {
  AuditionRow,
  ExcerptCardRow,
  ExcerptRow,
  PlannedSessionRow,
  PracticeProfileRow,
  RepListItemRow,
} from './db';
import { supabase } from './supabase';

export { buildMinimumViableSession } from '../scheduler/engine.ts';

/**
 * Invoke the ai edge function, surfacing the server's own error text (e.g. the
 * rate-limit message) instead of supabase-js's generic "non-2xx" string.
 */
async function invokeAi(body: Record<string, unknown>): Promise<{ items: unknown }> {
  const { data, error } = await supabase.functions.invoke('ai', { body });
  if (error) {
    let message = error.message;
    const ctx = (error as { context?: { json?: () => Promise<{ error?: string }> } }).context;
    if (ctx?.json) {
      try {
        const payload = await ctx.json();
        if (payload?.error) message = payload.error;
      } catch {
        // keep the generic message
      }
    }
    throw new Error(message);
  }
  return data as { items: unknown };
}

export async function canonicalizeRep(
  rawRepText: string,
  instrument = 'harp',
): Promise<CanonicalizedItem[]> {
  const data = await invokeAi({ op: 'canonicalize', rawRepText, instrument });
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

type WrittenSession = { session_id: string; blocks: { instructions: string }[]; coach_note: string };

/**
 * Model pass C over a set of sessions. Returns instructions keyed by session
 * date. Enrichment is always additive — on any failure the deterministic plan
 * stands on its own, so callers never need to handle a throw.
 */
async function writeSessionContent(
  ctx: LoadedPlanContext,
  sessions: PlanOutput['sessions'],
): Promise<Map<string, WrittenSession>> {
  const out = new Map<string, WrittenSession>();
  if (sessions.length === 0) return out;
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
          sessions: sessions.map((s) => ({
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
      for (const i of data.items as WrittenSession[]) out.set(i.session_id, i);
    }
  } catch {
    // swallow — additive only
  }
  return out;
}

/**
 * Lazily write model content for the next stretch of unwritten sessions in the
 * active plan (spec §5.6: cheap deltas, not full regenerations). Called when
 * the user reaches near the end of the already-written horizon. No-op without a
 * deployed edge function.
 */
export async function ensureSessionsWritten(
  userId: string,
  fromDate: string,
  days = 14,
): Promise<number> {
  const ctx = await loadPlanContext(userId);
  const { data: plan } = await supabase
    .from('practice_plans')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle();
  if (!plan) return 0;

  const until = addDays(fromDate, days);
  const { data: rows } = await supabase
    .from('planned_sessions')
    .select('*')
    .eq('plan_id', plan.id)
    .gte('date', fromDate)
    .lte('date', until)
    .order('date');

  // Only sessions whose excerpt blocks still lack instructions.
  const unwritten = (rows ?? []).filter((r: PlannedSessionRow) =>
    r.blocks.some((b) => b.kind === 'excerpt' && !b.instructions),
  );
  if (unwritten.length === 0) return 0;

  const written = await writeSessionContent(
    ctx,
    unwritten.map((r: PlannedSessionRow) => ({
      date: r.date,
      phase: r.phase as PlanOutput['sessions'][number]['phase'],
      plannedMinutes: r.planned_minutes,
      blocks: r.blocks as PlanOutput['sessions'][number]['blocks'],
    })),
  );
  if (written.size === 0) return 0;

  let updated = 0;
  for (const r of unwritten as PlannedSessionRow[]) {
    const w = written.get(r.date);
    if (!w) continue;
    const blocks = r.blocks.map((b, i) => ({ ...b, instructions: w.blocks?.[i]?.instructions ?? b.instructions }));
    await supabase.from('planned_sessions').update({ blocks }).eq('id', r.id);
    updated += 1;
  }
  return updated;
}

/**
 * Generate, enrich the first two weeks with model-written content, persist.
 * Later weeks keep deterministic labels and get written lazily by
 * ensureSessionsWritten — replans are cheap deltas, not full regenerations.
 */
export async function generateAndStorePlan(userId: string, today: string): Promise<PlanOutput> {
  const ctx = await loadPlanContext(userId);
  const inputs = buildPlanInputs(ctx, today);
  if ('missing' in inputs) throw new Error(inputs.missing);

  const plan = generatePlan(inputs);

  // Model pass C on the near horizon only.
  const enrichUntil = addDays(today, 14);
  const instructionsBySession = await writeSessionContent(
    ctx,
    plan.sessions.filter((s) => s.date <= enrichUntil),
  );

  await persistPlan(userId, today, plan, instructionsBySession);
  return plan;
}

/** Supersede the active plan and write a fresh one + its sessions. */
async function persistPlan(
  userId: string,
  today: string,
  plan: PlanOutput,
  instructionsBySession: Map<string, WrittenSession>,
): Promise<void> {
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
}

/**
 * Adaptive replan (spec §5.6). Reads recent adherence, runs the tested,
 * deterministic `replan()` (which rebalances and produces guilt-free copy),
 * persists the new plan, and enriches its near horizon. Returns the structured
 * result so the UI can show the plain-language message.
 */
export async function replanAndStore(userId: string, today: string): Promise<ReplanResult> {
  const ctx = await loadPlanContext(userId);
  const inputs = buildPlanInputs(ctx, today);
  if ('missing' in inputs) throw new Error(inputs.missing);

  // Pull adherence from the active plan's logged sessions.
  const { data: active } = await supabase
    .from('practice_plans')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle();
  let adherence: AdherenceEvent[] = [];
  if (active) {
    const { data: logged } = await supabase
      .from('planned_sessions')
      .select('date, status, actual_minutes')
      .eq('plan_id', active.id)
      .neq('status', 'planned');
    adherence = (logged ?? []).map((r: Pick<PlannedSessionRow, 'date' | 'status' | 'actual_minutes'>) => ({
      date: r.date,
      status: r.status as AdherenceEvent['status'],
      actualMinutes: r.actual_minutes ?? undefined,
    }));
  }

  const result = replan(inputs, adherence, today);
  const enrichUntil = addDays(today, 14);
  const written = await writeSessionContent(
    ctx,
    result.plan.sessions.filter((s) => s.date <= enrichUntil),
  );
  await persistPlan(userId, today, result.plan, written);
  return result;
}

/** Count skipped sessions in the last `windowDays` — the replan trigger. */
export async function recentSkipCount(userId: string, today: string, windowDays = 7): Promise<number> {
  const from = addDays(today, -windowDays);
  const { data: active } = await supabase
    .from('practice_plans')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle();
  if (!active) return 0;
  const { count } = await supabase
    .from('planned_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('plan_id', active.id)
    .eq('status', 'skipped')
    .gte('date', from)
    .lte('date', today);
  return count ?? 0;
}
