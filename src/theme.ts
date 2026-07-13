/**
 * Advance visual language: a calm, dark command center. No gamification
 * colors, no red alarms — the readiness dashboard never shames (spec §8).
 */

export const colors = {
  bg: '#0E1116',
  surface: '#171C24',
  surfaceRaised: '#1F2630',
  border: '#2A3340',
  text: '#EDF1F7',
  textDim: '#93A0B4',
  textFaint: '#5C6878',
  accent: '#D4A853', // brass
  accentSoft: '#3A3220',
  positive: '#7FB58A',
  positiveSoft: '#22301F',
  info: '#7FA8D9',
  infoSoft: '#1E2A3A',
  caution: '#C9A87C', // "tight" is warm, never alarming
  cautionSoft: '#332A1C',
  danger: '#C98A8A', // reserved for destructive actions only
} as const;

export const readinessMeta: Record<
  'not_started' | 'learning' | 'under_tempo' | 'performance_ready',
  { label: string; color: string; soft: string }
> = {
  not_started: { label: 'Not started', color: colors.textDim, soft: colors.surfaceRaised },
  learning: { label: 'Learning', color: colors.info, soft: colors.infoSoft },
  under_tempo: { label: 'Under tempo', color: colors.caution, soft: colors.cautionSoft },
  performance_ready: { label: 'Performance ready', color: colors.positive, soft: colors.positiveSoft },
};

export const statusMeta: Record<string, { label: string; color: string }> = {
  applied: { label: 'Applied', color: colors.textDim },
  prescreen: { label: 'Prescreen', color: colors.info },
  invited: { label: 'Invited', color: colors.accent },
  prelims: { label: 'Prelims', color: colors.accent },
  semis: { label: 'Semis', color: colors.accent },
  finals: { label: 'Finals', color: colors.positive },
  result: { label: 'Result', color: colors.textDim },
};

export const phaseMeta: Record<string, { label: string; color: string }> = {
  learn: { label: 'Learn', color: colors.info },
  build: { label: 'Build', color: colors.accent },
  consolidate: { label: 'Consolidate', color: colors.caution },
  simulate: { label: 'Simulate', color: colors.positive },
  taper: { label: 'Taper', color: colors.textDim },
  maintain: { label: 'Maintain', color: colors.textFaint },
};

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;

export const type = {
  title: { fontSize: 28, fontWeight: '700' as const, color: colors.text, letterSpacing: -0.5 },
  heading: { fontSize: 20, fontWeight: '600' as const, color: colors.text },
  body: { fontSize: 15, color: colors.text, lineHeight: 22 },
  dim: { fontSize: 14, color: colors.textDim, lineHeight: 20 },
  small: { fontSize: 12, color: colors.textFaint },
  mono: { fontSize: 13, color: colors.textDim, fontVariant: ['tabular-nums'] as const },
};
