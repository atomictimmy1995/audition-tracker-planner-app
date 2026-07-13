import { describe, expect, it } from 'vitest';

import { SEED_EXCERPTS } from '../../data/seedExcerpts.ts';
import {
  AssessOutput,
  CANONICALIZE_CONFIDENCE_THRESHOLD,
  CanonicalizeOutput,
  parseModelJson,
} from '../contracts.ts';
import { localCanonicalize, normalize, splitRepList } from '../localCanonicalize.ts';
import { assessPrompt, canonicalizePrompt, writeSessionsPrompt } from '../prompts.ts';

const LIBRARY = SEED_EXCERPTS.map((e) => ({
  excerptId: e.slug,
  composer: e.composer,
  work: e.work,
  movement: e.movement,
  sectionLabel: e.sectionLabel,
  aliases: e.aliases,
}));

describe('localCanonicalize — deterministic pre-pass', () => {
  it('resolves exact and alias matches without a model', () => {
    const raw = [
      'Symph fantastique harp 1',
      'Nutcracker cadenza',
      'Debussy Danses',
      'Mahler 5',
    ].join('\n');
    const { matched, unmatched } = localCanonicalize(raw, LIBRARY);
    expect(matched.map((m) => m.excerpt_id)).toEqual([
      'berlioz-symphonie-fantastique-un-bal-harp1',
      'tchaikovsky-nutcracker-waltz-of-the-flowers-cadenza',
      'debussy-danses-sacree-et-profane',
      'mahler-symphony5-adagietto',
    ]);
    expect(matched.every((m) => m.confidence === 1)).toBe(true);
    expect(unmatched).toHaveLength(0);
  });

  it('treats names shared by two excerpts as ambiguous and defers to the model', () => {
    // "Symphonie fantastique" is the work name of both the harp 1 and harp 2
    // entries — the pre-pass must not pick one silently.
    const { matched, unmatched } = localCanonicalize('Symphonie fantastique', LIBRARY);
    expect(matched).toHaveLength(0);
    expect(unmatched).toEqual(['Symphonie fantastique']);
  });

  it('sends genuinely fuzzy lines to the model instead of guessing', () => {
    const raw = 'Mahler Symphony No. 5, I. Trauermarsch\nthe fast bit from that ballet';
    const { matched, unmatched } = localCanonicalize(raw, LIBRARY);
    expect(matched).toHaveLength(0);
    expect(unmatched).toHaveLength(2);
  });

  it('handles numbered and bulleted paste formats', () => {
    const lines = splitRepList('1. Symphonie fantastique\n2) Nutcracker cadenza\n• Tzigane');
    expect(lines).toEqual(['Symphonie fantastique', 'Nutcracker cadenza', 'Tzigane']);
  });

  it('normalizes diacritics, punctuation and filler words', () => {
    expect(normalize('Má vlast: Vyšehrad')).toBe(normalize('Ma vlast Vysehrad'));
    expect(normalize('Symphony No. 5')).toBe(normalize('sym 5'));
  });
});

describe('model output validation', () => {
  it('accepts valid canonicalize JSON (fenced or not)', () => {
    const payload = JSON.stringify([
      { raw_text: 'Mahler 5, mvt 1', excerpt_id: 'mahler-symphony5-adagietto', confidence: 0.93 },
      { raw_text: 'some concerto', excerpt_id: null, confidence: 0.2 },
    ]);
    expect(parseModelJson(CanonicalizeOutput, payload)).toHaveLength(2);
    expect(parseModelJson(CanonicalizeOutput, '```json\n' + payload + '\n```')).toHaveLength(2);
  });

  it('rejects malformed output loudly — never a silent guess', () => {
    expect(() =>
      parseModelJson(CanonicalizeOutput, '[{"raw_text": "x", "confidence": "high"}]'),
    ).toThrow();
    expect(() => parseModelJson(AssessOutput, 'Sure! Here is the JSON: []')).toThrow();
  });

  it('threshold gate: low-confidence items are for the user, not the plan', () => {
    const items = parseModelJson(
      CanonicalizeOutput,
      JSON.stringify([
        { raw_text: 'a', excerpt_id: 'x', confidence: 0.95 },
        { raw_text: 'b', excerpt_id: 'y', confidence: 0.55 },
      ]),
    );
    const auto = items.filter((i) => i.confidence >= CANONICALIZE_CONFIDENCE_THRESHOLD);
    const confirm = items.filter((i) => i.confidence < CANONICALIZE_CONFIDENCE_THRESHOLD);
    expect(auto).toHaveLength(1);
    expect(confirm).toHaveLength(1);
  });
});

describe('prompts stay inside the division of labor', () => {
  it('canonicalize prompt includes the library and demands strict JSON', () => {
    const prompt = canonicalizePrompt({
      instrument: 'harp',
      rawRepText: 'Mahler 5',
      library: LIBRARY.slice(0, 3),
    });
    expect(prompt).toContain('strict JSON');
    expect(prompt).toContain(LIBRARY[0].excerptId);
  });

  it('assess prompt forbids scheduling', () => {
    const prompt = assessPrompt({
      userLevel: 'professional',
      weeksAvailable: 8,
      excerpts: [
        {
          excerptId: 'x',
          composer: 'Berlioz',
          work: 'Symphonie fantastique',
          libraryDifficulty: 5,
          typicalPrepWeeks: 8,
          selfRating: 'under_tempo',
        },
      ],
    });
    expect(prompt).toContain('Produce no dates');
  });

  it('write_sessions prompt pins the schedule as fixed and grounds in knowledge', () => {
    const prompt = writeSessionsPrompt({
      practiceProfile: { warmupRitual: 'gliss warmups' },
      sessions: [
        {
          sessionId: 's1',
          date: '2026-09-01',
          phase: 'build',
          blocks: [{ kind: 'excerpt', minutes: 15, excerptId: 'x', phase: 'build' }],
        },
      ],
      knowledge: [
        {
          excerptId: 'x',
          displayName: 'Symphonie fantastique',
          technicalTraps: ['pedal reset two bars early'],
          practiceStrategies: ['drone on resolution pitch'],
          commonFailureModes: ['rushing the final third'],
        },
      ],
    });
    expect(prompt).toContain('FIXED');
    expect(prompt).toContain('pedal reset two bars early');
    expect(prompt).toContain('gliss warmups');
    expect(prompt).toContain('never position yourself as');
  });
});
