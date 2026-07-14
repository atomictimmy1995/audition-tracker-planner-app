/** Row types mirroring supabase/migrations/20260713000000_init.sql. */

import type { Phase, Readiness } from '../scheduler/types.ts';

export type AuditionStatus =
  | 'applied'
  | 'prescreen'
  | 'invited'
  | 'prelims'
  | 'semis'
  | 'finals'
  | 'result';

export type AuditionRound = 'prescreen' | 'prelim' | 'semi' | 'final';

export interface AuditionRow {
  id: string;
  user_id: string;
  name: string;
  ensemble: string | null;
  audition_date: string | null;
  application_deadline: string | null;
  prescreen_deadline: string | null;
  round_structure: AuditionRound[];
  fee: number | null;
  travel_notes: string | null;
  status: AuditionStatus;
  result: string | null;
  notes: string | null;
}

export interface ExcerptRow {
  id: string;
  slug: string;
  composer: string;
  work: string;
  movement: string | null;
  section_label: string | null;
  instrument: string;
  difficulty: number;
  typical_prep_weeks: number;
  aliases: string[];
}

export interface RepListItemRow {
  id: string;
  audition_id: string;
  excerpt_id: string | null;
  round: AuditionRound;
  required: boolean;
  raw_text: string;
}

export interface ExcerptCardRow {
  id: string;
  user_id: string;
  excerpt_id: string;
  readiness: Readiness;
  current_tempo: number | null;
  target_tempo: number | null;
  notes: string | null;
  updated_at: string;
}

export interface RecordingRow {
  id: string;
  user_id: string;
  excerpt_card_id: string | null;
  mock_session_id: string | null;
  file_url: string;
  duration_secs: number | null;
  take_number: number;
  tempo: number | null;
  self_rating: number | null;
  created_at: string;
}

export interface PracticeProfileRow {
  id: string;
  user_id: string;
  days_per_week: number;
  session_minutes: number;
  time_of_day: string | null;
  warmup_ritual: string | null;
  closing_ritual: string | null;
  blackout_dates: string[];
  minimum_viable_session: number;
}

export interface PracticePlanRow {
  id: string;
  user_id: string;
  generated_at: string;
  version: number;
  horizon_start: string;
  horizon_end: string;
  phase_map: Record<string, unknown>;
  status: 'active' | 'superseded';
}

export interface PlannedSessionRow {
  id: string;
  plan_id: string;
  date: string;
  planned_minutes: number;
  phase: Phase | string;
  blocks: Array<{
    kind: string;
    minutes: number;
    label: string;
    excerptId?: string;
    phase?: string;
    instructions?: string;
    auditionId?: string;
    mockOrder?: string[];
  }>;
  status: 'planned' | 'completed' | 'partial' | 'skipped';
  actual_minutes: number | null;
}

export function excerptDisplayName(e: Pick<ExcerptRow, 'composer' | 'work' | 'section_label' | 'movement'>): string {
  const tail = e.section_label ?? e.movement;
  return `${e.composer} — ${e.work}${tail ? ` (${tail})` : ''}`;
}
