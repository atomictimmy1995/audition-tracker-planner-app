# Advance

**The audition command center for classical musicians.** Every deadline, excerpt, recording, and practice day for every audition — in one place.

Built from `advancebuildspec.md` (v0.1). Wedge instrument: harp; architecture is instrument-agnostic.

## Architecture

The one non-negotiable rule (spec §5.1): **the deterministic scheduler owns the math; the model owns the musical reasoning and the language.**

```
Rep lists ──▶ canonicalize (LLM, edge fn)*──▶ overlap analysis (set logic)
                                                    │
Practice profile (6 tapped questions) ──────────────┤
                                                    ▼
                              periodized scheduler (pure TS, unit-tested)
                                                    │
                                                    ▼
                    write_sessions (LLM + RAG over ExcerptKnowledge, edge fn)
                                                    │
                                                    ▼
                            live plan → rotation grid + daily sessions
                                  ↺ adherence → cheap delta replans

* exact/alias matches are resolved by a deterministic pre-pass and never
  reach the model; only fuzzy lines do.
```

| Layer | Where | Notes |
|---|---|---|
| `src/scheduler/` | pure TS, zero deps | Phases, rotation (smooth weighted round-robin), guardrails, overlap, replan. **48 unit tests, no LLM anywhere.** |
| `src/ai/` | pure TS | Zod contracts for the 3 model calls, prompt builders, deterministic canonicalize pre-pass. Unit-tested. |
| `src/data/seedExcerpts.ts` | pure TS | 63 canonical harp excerpts + 15 curated knowledge entries (the RAG moat, spec §5.4). Source of truth for `supabase/seed.sql`. |
| `supabase/` | SQL + Deno | Full schema with RLS (`migrations/`), generated seed, and the `ai` edge function — the only place model calls happen. |
| `app/` | Expo Router | Screens: dashboard, audition pipeline, portfolio, plan, rep entry + canonicalization confirm, overlap payoff, profile elicitation, recorder, mock audition mode. |

The pure modules use explicit `.ts` import extensions so the Deno edge function imports the *same* prompt builders and contracts the tests cover.

## Getting started

```bash
npm install --legacy-peer-deps
npm test                 # scheduler + AI contract tests (no network, no keys)
npm run typecheck
```

Run the app against a Supabase project:

1. Create a project, then apply `supabase/migrations/0001_init.sql` and `supabase/seed.sql` (regenerate the latter anytime with `npm run seed:sql`).
2. `cp .env.example .env` and fill in the project URL + anon key.
3. Deploy the model proxy: `supabase functions deploy ai` and `supabase secrets set ANTHROPIC_API_KEY=...`. The app works without it — plans fall back to deterministic labels; rep entry falls back to exact library matching.
4. `npx expo start`

## Guardrails are code, not prompts (spec §8)

- Week-over-week volume ramp is hard-capped (`applyVolumeCaps`, plus a final pass on the assembled plan).
- One full rest day per week minimum — a 7-day profile is clamped to 6, with an explanation.
- In-session breaks every 40 minutes; 240 min/day absolute ceiling; taper weeks may always shrink.
- Missed sessions are absorbed: three misses trigger a replan that pulls back far-out single-audition rep, protects the shared spine, and explains itself plainly. The replan message is template-built from structured facts and unit-tested against shaming language.

## Build-order status (spec §9)

| Phase | Scope | Status |
|---|---|---|
| 0 | Expo scaffold, Supabase schema + auth, seed excerpts + knowledge | ✅ |
| 1 | Audition pipeline + excerpt portfolio CRUD, readiness ratings | ✅ |
| 2 | Recorder + per-excerpt filing | ✅ core (background sync TODO) |
| 3 | Deterministic scheduler, fixtures, no LLM | ✅ 48 tests |
| 4 | Model calls A→B→C wired to scheduler, overlap payoff screen | ✅ wiring (needs deployed edge fn + key) |
| 5 | Replan loop + adherence tracking | ✅ engine + logging (auto-trigger on 3rd skip TODO) |
| 6 | Mock audition mode | ✅ shuffle/timing/full-run recording (auto-split by excerpt TODO — split points are already captured) |
| 7 | RevenueCat paywall, TestFlight beta | ◻ stubbed (`src/lib/entitlements.ts` enforces free limits) |

### Open items toward the acceptance criteria (§10)

- **#1 (≥90% canonicalization on messy real lists):** needs evaluation against real pasted lists; the confidence gate + confirm-don't-guess UI is in place at threshold 0.8. OCR path (photograph a list) not started.
- **#4 (sessions indistinguishable from a teacher's):** knowledge entries cover 15 of 63 excerpts; expand to full coverage before launch and run the blind read with a professional harpist.
- Remaining knowledge entries, per-excerpt recording auto-split, RevenueCat, OCR.
