/**
 * Prompt builders for the three model calls (spec §5.5). Kept as data-in,
 * string-out functions so they are unit-testable without any API client.
 *
 * Division of labor is absolute: the scheduler owns the math; the model owns
 * musical reasoning and language. No prompt here asks the model for dates,
 * minutes, or counts it didn't receive.
 */

import type { AssessInput, CanonicalizeInput, WriteSessionsInput } from './contracts.ts';

const STRICT_JSON =
  'Respond with strict JSON only. No prose, no markdown fences, no comments.';

export function canonicalizePrompt(input: CanonicalizeInput): string {
  return [
    `You canonicalize orchestral audition repertoire lists for ${input.instrument}.`,
    'Map each line item of the raw list to one excerpt id from the library, or null.',
    'This is a matching problem, not a reasoning problem: "Mahler 5, mvt. 1",',
    '"Mahler Symphony No. 5, I. Trauermarsch" and "Mahler 5 (opening)" are the same node.',
    '',
    'Rules:',
    '- confidence is your calibrated probability the mapping is correct (0..1).',
    '- Never force a match. If nothing fits, excerpt_id = null and, when the line',
    '  clearly names a real piece, include suggested_new_excerpt.',
    '- Preserve raw_text exactly as given, one output item per input line.',
    '',
    `Library (id | composer | work | movement | section | aliases):`,
    ...input.library.map(
      (e) =>
        `${e.excerptId} | ${e.composer} | ${e.work} | ${e.movement ?? ''} | ${e.sectionLabel ?? ''} | ${e.aliases.join('; ')}`,
    ),
    '',
    'Raw rep list:',
    input.rawRepText,
    '',
    'Output schema: [{"raw_text": string, "excerpt_id": string|null, "confidence": number,',
    ' "suggested_new_excerpt"?: {"composer": string, "work": string, "movement"?: string, "section_label"?: string}}]',
    STRICT_JSON,
  ].join('\n');
}

export function assessPrompt(input: AssessInput): string {
  return [
    `You assess audition repertoire for a ${input.userLevel}-level musician with`,
    `${input.weeksAvailable} weeks available. For each excerpt estimate difficulty (1-5),`,
    'realistic prep weeks FOR THIS USER (self-rating matters more than the library default),',
    'and a priority score (0..2, 1 = neutral) reflecting what is underdone relative to time.',
    'rationale: one sentence, concrete, no filler. Produce no dates — scheduling is not your job.',
    '',
    'Excerpts (id | composer | work | library difficulty | typical prep weeks | self-rating):',
    ...input.excerpts.map(
      (e) =>
        `${e.excerptId} | ${e.composer} | ${e.work} | ${e.libraryDifficulty} | ${e.typicalPrepWeeks} | ${e.selfRating}`,
    ),
    '',
    'Output schema: [{"excerpt_id": string, "difficulty": number, "estimated_prep_weeks": number,',
    ' "priority_score": number, "rationale": string}]',
    STRICT_JSON,
  ].join('\n');
}

export function writeSessionsPrompt(input: WriteSessionsInput): string {
  return [
    'You write practice session content for a serious orchestral audition candidate.',
    'The schedule below is FIXED: never change dates, block order, minutes, or which',
    'excerpt appears where. You write instructions and coaching language only.',
    '',
    'Grounding: base every excerpt instruction on the knowledge entries provided —',
    'specific technical traps, practice strategies, committee expectations. Generic',
    'advice ("practice slowly with a metronome") is a failure. If a block\'s excerpt',
    'has no knowledge entry, write phase-appropriate structural guidance instead and',
    'keep it honest about being general.',
    '',
    'Tone: this scaffolds what their teacher told them — never position yourself as',
    'the coach. No shaming, no grind-glorification, no "push through pain", ever.',
    input.practiceProfile.warmupRitual
      ? `Their warm-up ritual: ${input.practiceProfile.warmupRitual}. Reference it in warmup blocks.`
      : '',
    input.practiceProfile.closingRitual
      ? `Their closer: ${input.practiceProfile.closingRitual}. Reference it in closer blocks.`
      : '',
    '',
    'Knowledge entries:',
    JSON.stringify(input.knowledge),
    '',
    'Sessions to write:',
    JSON.stringify(input.sessions),
    '',
    'Output schema: [{"session_id": string, "blocks": [{"excerpt_id"?: string, "label": string,',
    ' "minutes": number, "instructions": string}], "coach_note": string}]',
    'blocks must mirror the input blocks one-to-one (same order, same minutes).',
    'coach_note: 1-2 sentences framing the day. Encouraging, specific, never saccharine.',
    STRICT_JSON,
  ]
    .filter((line) => line !== '')
    .join('\n');
}
