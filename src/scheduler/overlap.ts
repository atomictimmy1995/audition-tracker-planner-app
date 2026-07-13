/**
 * Overlap analysis — plain set logic, zero model involvement (spec §5.3).
 * The model's only job upstream was mapping free text → canonical excerpt ids;
 * everything here is deterministic and instantly testable.
 */

import type { AuditionInput, OverlapAnalysis } from './types.ts';

export function analyzeOverlap(auditions: AuditionInput[]): OverlapAnalysis {
  const auditionIdsByExcerpt: Record<string, string[]> = {};
  let totalLineItems = 0;

  for (const audition of auditions) {
    for (const excerptId of audition.repExcerptIds) {
      totalLineItems += 1;
      const list = (auditionIdsByExcerpt[excerptId] ??= []);
      if (!list.includes(audition.id)) list.push(audition.id);
    }
  }

  const spine: OverlapAnalysis['spine'] = [];
  const orphans: OverlapAnalysis['orphans'] = [];

  for (const [excerptId, auditionIds] of Object.entries(auditionIdsByExcerpt)) {
    if (auditionIds.length >= 2) {
      spine.push({ excerptId, auditionIds });
    } else {
      orphans.push({ excerptId, auditionId: auditionIds[0] });
    }
  }

  // Most-shared first, then stable by id — keeps the payoff screen deterministic.
  spine.sort(
    (a, b) =>
      b.auditionIds.length - a.auditionIds.length ||
      a.excerptId.localeCompare(b.excerptId),
  );
  orphans.sort((a, b) => a.excerptId.localeCompare(b.excerptId));

  return {
    totalLineItems,
    distinctExcerpts: Object.keys(auditionIdsByExcerpt).length,
    spine,
    orphans,
    auditionIdsByExcerpt,
  };
}

/**
 * Copy for the payoff screen (spec §5.3). Deterministic template — the model
 * never touches these numbers.
 */
export function overlapSummary(
  overlap: OverlapAnalysis,
  auditionCount: number,
  excerptNames: Record<string, string> = {},
): string {
  const name = (id: string) => excerptNames[id] ?? id;
  const parts: string[] = [
    `You listed ${auditionCount} audition${auditionCount === 1 ? '' : 's'} and ` +
      `${overlap.totalLineItems} line items — but that's really ` +
      `${overlap.distinctExcerpts} distinct excerpts.`,
  ];

  const allShared = overlap.spine.filter(
    (s) => s.auditionIds.length === auditionCount,
  );
  if (auditionCount > 1 && allShared.length > 0) {
    parts.push(
      `${allShared.map((s) => name(s.excerptId)).join(' and ')} ` +
        `appear${allShared.length === 1 ? 's' : ''} on all ${auditionCount}.`,
    );
  }
  if (overlap.orphans.length > 0) {
    parts.push(`${overlap.orphans.length} items are single-audition only.`);
  }
  return parts.join(' ');
}
