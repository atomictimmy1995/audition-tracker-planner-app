import { describe, expect, it } from 'vitest';

import { analyzeOverlap, overlapSummary } from '../overlap.ts';
import {
  AUDITIONS,
  DANSES,
  FIREBIRD,
  LUCIA,
  NUTCRACKER,
  SYMPH_FANTASTIQUE,
} from './fixtures.ts';

describe('analyzeOverlap (acceptance criterion #2)', () => {
  const overlap = analyzeOverlap(AUDITIONS);

  it('counts line items and distinct excerpts', () => {
    expect(overlap.totalLineItems).toBe(12); // 5 + 4 + 3
    expect(overlap.distinctExcerpts).toBe(7);
  });

  it('identifies the shared spine', () => {
    const spineIds = overlap.spine.map((s) => s.excerptId);
    expect(spineIds).toContain(SYMPH_FANTASTIQUE);
    expect(spineIds).toContain(NUTCRACKER);
    expect(spineIds).toContain(DANSES);
    // Most-shared first: the two on all three auditions lead.
    expect(overlap.spine[0].auditionIds).toHaveLength(3);
  });

  it('identifies orphan rep with its owning audition', () => {
    const lucia = overlap.orphans.find((o) => o.excerptId === LUCIA);
    expect(lucia?.auditionId).toBe('aud-kc');
    const firebird = overlap.orphans.find((o) => o.excerptId === FIREBIRD);
    expect(firebird?.auditionId).toBe('aud-desmoines');
  });

  it('spine + orphans partition the distinct excerpts', () => {
    expect(overlap.spine.length + overlap.orphans.length).toBe(overlap.distinctExcerpts);
  });

  it('writes the payoff copy from set logic alone', () => {
    const copy = overlapSummary(overlap, AUDITIONS.length, {
      [SYMPH_FANTASTIQUE]: 'Symphonie fantastique',
      [NUTCRACKER]: 'the Nutcracker cadenza',
    });
    expect(copy).toContain('3 auditions and 12 line items');
    expect(copy).toContain('7 distinct excerpts');
    expect(copy).toContain('Symphonie fantastique and the Nutcracker cadenza');
    expect(copy).toContain('4 items are single-audition only');
  });

  it('handles a single audition without inventing overlap', () => {
    const single = analyzeOverlap([AUDITIONS[0]]);
    expect(single.spine).toHaveLength(0);
    expect(single.orphans).toHaveLength(5);
  });
});
