/**
 * Shared fixtures: three fall auditions with genuine rep overlap, modeled on
 * the spec's payoff-screen example (§5.3).
 */

import type { PlanInputs } from '../engine.ts';
import type { AuditionInput, ExcerptInput, PracticeProfileInput } from '../types.ts';

export const SYMPH_FANTASTIQUE = 'berlioz-symphonie-fantastique-un-bal-harp1';
export const NUTCRACKER = 'tchaikovsky-nutcracker-waltz-of-the-flowers-cadenza';
export const DANSES = 'debussy-danses-sacree-et-profane';
export const ADAGIETTO = 'mahler-symphony5-adagietto';
export const VYSEHRAD = 'smetana-vysehrad-opening';
export const LUCIA = 'donizetti-lucia-harp-solo';
export const FIREBIRD = 'stravinsky-firebird-berceuse';

export const AUDITIONS: AuditionInput[] = [
  {
    id: 'aud-omaha',
    name: 'Omaha Symphony',
    auditionDate: '2026-10-05',
    repExcerptIds: [SYMPH_FANTASTIQUE, NUTCRACKER, DANSES, ADAGIETTO, VYSEHRAD],
  },
  {
    id: 'aud-kc',
    name: 'Kansas City Symphony',
    auditionDate: '2026-11-20',
    repExcerptIds: [SYMPH_FANTASTIQUE, NUTCRACKER, DANSES, LUCIA],
  },
  {
    id: 'aud-desmoines',
    name: 'Des Moines Symphony',
    auditionDate: '2026-12-12',
    repExcerptIds: [SYMPH_FANTASTIQUE, NUTCRACKER, FIREBIRD],
  },
];

export const EXCERPTS: ExcerptInput[] = [
  { excerptId: SYMPH_FANTASTIQUE, difficulty: 5, readiness: 'under_tempo' },
  { excerptId: NUTCRACKER, difficulty: 5, readiness: 'learning' },
  { excerptId: DANSES, difficulty: 5, readiness: 'performance_ready' },
  { excerptId: ADAGIETTO, difficulty: 3, readiness: 'under_tempo' },
  { excerptId: VYSEHRAD, difficulty: 3, readiness: 'performance_ready' },
  { excerptId: LUCIA, difficulty: 4, readiness: 'not_started' },
  { excerptId: FIREBIRD, difficulty: 4, readiness: 'not_started' },
];

export const PROFILE: PracticeProfileInput = {
  daysPerWeek: 5,
  sessionMinutes: 90,
  blackoutDates: ['2026-08-14', '2026-08-15', '2026-09-07'],
  warmupMinutes: 10,
  closerMinutes: 5,
  minimumViableSessionMinutes: 20,
};

export function baseInputs(overrides: Partial<PlanInputs> = {}): PlanInputs {
  return {
    auditions: AUDITIONS,
    excerpts: EXCERPTS,
    profile: PROFILE,
    options: { horizonStart: '2026-08-10' },
    ...overrides,
  };
}
