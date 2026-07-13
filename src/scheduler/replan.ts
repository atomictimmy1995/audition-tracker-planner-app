/**
 * The replan loop (spec §5.6). Cheap deltas, not full regenerations; the
 * deterministic core rebalances and produces structured facts. Copy is
 * templated here (never shaming — spec §8); the model may rephrase it but
 * never invents the numbers.
 */

import { diffDays } from './dates.ts';
import { generatePlan, type PlanInputs } from './engine.ts';
import { analyzeOverlap } from './overlap.ts';
import type { AdherenceEvent, ISODate, ReplanResult } from './types.ts';

const MISSES_BEFORE_REBALANCE = 3;
/** Orphans whose audition is at least this far out get pulled back first. */
const ORPHAN_DEPRIORITIZE_HORIZON_DAYS = 21;
const ORPHAN_DEPRIORITIZE_FACTOR = 0.5;

export function replan(
  inputs: PlanInputs,
  adherence: AdherenceEvent[],
  today: ISODate,
): ReplanResult {
  const recentWindowStart = -7;
  const missedSessions = adherence.filter(
    (e) =>
      e.status === 'skipped' &&
      diffDays(e.date, today) >= 0 &&
      diffDays(e.date, today) <= -recentWindowStart,
  ).length;

  const overlap = analyzeOverlap(inputs.auditions);
  const spineIds = new Set(overlap.spine.map((s) => s.excerptId));
  const auditionById = new Map(inputs.auditions.map((a) => [a.id, a]));

  const deprioritized: string[] = [];
  let excerpts = inputs.excerpts;

  if (missedSessions >= MISSES_BEFORE_REBALANCE) {
    excerpts = inputs.excerpts.map((e) => {
      const orphan = overlap.orphans.find((o) => o.excerptId === e.excerptId);
      if (!orphan) return e;
      const audition = auditionById.get(orphan.auditionId);
      if (!audition) return e;
      if (diffDays(today, audition.auditionDate) >= ORPHAN_DEPRIORITIZE_HORIZON_DAYS) {
        deprioritized.push(e.excerptId);
        return { ...e, priorityScore: (e.priorityScore ?? 1) * ORPHAN_DEPRIORITIZE_FACTOR };
      }
      return e;
    });
  }

  const newInputs: PlanInputs = {
    ...inputs,
    excerpts,
    options: { ...inputs.options, horizonStart: today },
  };
  const plan = generatePlan(newInputs);

  // Risk heuristic: minutes the plan can actually give an audition's rep
  // before its date, vs. a rough need estimate from difficulty × deficit.
  const auditionRisk = inputs.auditions
    .filter((a) => diffDays(today, a.auditionDate) >= 0)
    .map((a) => {
      const repIds = new Set(a.repExcerptIds);
      let plannedMinutes = 0;
      for (const s of plan.sessions) {
        if (diffDays(s.date, a.auditionDate) < 0) continue;
        for (const b of s.blocks) {
          if (b.kind === 'excerpt' && b.excerptId && repIds.has(b.excerptId)) {
            plannedMinutes += b.minutes;
          }
          if (b.kind === 'mock_run' && b.auditionId === a.id) {
            plannedMinutes += b.minutes;
          }
        }
      }
      const needMinutes = inputs.excerpts
        .filter((e) => repIds.has(e.excerptId))
        .reduce((sum, e) => sum + e.difficulty * deficitOf(e.readiness) * 12, 0);
      const ratio = needMinutes === 0 ? 2 : plannedMinutes / needMinutes;
      const status = ratio >= 1.1 ? 'on_track' : ratio >= 0.75 ? 'tight' : 'at_risk';
      return { auditionId: a.id, status } as const;
    });

  const changes: ReplanResult['changes'] = {
    missedSessions,
    deprioritizedExcerptIds: deprioritized,
    protectedSpineExcerptIds: [...spineIds],
    auditionRisk: [...auditionRisk],
  };

  return { plan, changes, message: buildMessage(changes, auditionById, today) };
}

function deficitOf(readiness: 'not_started' | 'learning' | 'under_tempo' | 'performance_ready') {
  return { not_started: 4, learning: 3, under_tempo: 2, performance_ready: 1 }[readiness];
}

/**
 * Plain language, zero guilt. Missed days are absorbed by the planner,
 * never scored against the user.
 */
function buildMessage(
  changes: ReplanResult['changes'],
  auditionById: Map<string, { name: string; auditionDate: ISODate }>,
  today: ISODate,
): string {
  const parts: string[] = [];

  if (changes.missedSessions >= MISSES_BEFORE_REBALANCE) {
    parts.push("You've had a rough week — the plan absorbs that, that's its job.");
    if (changes.deprioritizedExcerptIds.length > 0) {
      parts.push(
        `I've pulled back ${changes.deprioritizedExcerptIds.length} single-audition ` +
          `excerpt${changes.deprioritizedExcerptIds.length === 1 ? '' : 's'} and protected your shared spine.`,
      );
    } else {
      parts.push('Your rotation has been rebalanced around what matters most right now.');
    }
  } else {
    parts.push('Plan refreshed from today.');
  }

  const named = (id: string) => auditionById.get(id)?.name ?? id;
  const fmt = (id: string) => {
    const a = auditionById.get(id);
    return a ? `${named(id)} (${a.auditionDate})` : id;
  };
  const onTrack = changes.auditionRisk.filter((r) => r.status === 'on_track');
  const tight = changes.auditionRisk.filter((r) => r.status === 'tight');
  const atRisk = changes.auditionRisk.filter((r) => r.status === 'at_risk');

  if (onTrack.length > 0) {
    parts.push(`You're still on track for ${onTrack.map((r) => fmt(r.auditionId)).join(', ')}.`);
  }
  if (tight.length > 0) {
    parts.push(`${tight.map((r) => named(r.auditionId)).join(', ')} is getting tight.`);
  }
  if (atRisk.length > 0) {
    parts.push(
      `${atRisk.map((r) => named(r.auditionId)).join(', ')} needs a conversation — ` +
        'consider trimming its list or adjusting expectations. Your call, not a verdict.',
    );
  }

  return parts.join(' ');
}
