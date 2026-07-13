/**
 * Edge function: the only place model calls happen. The Anthropic key never
 * ships in the app; the scheduler math never happens here.
 *
 * Ops (spec §5.5):
 *   canonicalize — messy rep lines → canonical excerpt ids (library from DB)
 *   assess       — difficulty / prep weeks / priority for this user
 *   write        — session prose grounded in ExcerptKnowledge (RAG)
 *
 * Deploy: supabase functions deploy ai
 * Secrets: supabase secrets set ANTHROPIC_API_KEY=...
 */

import { createClient } from 'npm:@supabase/supabase-js@2';

import {
  AssessInput,
  AssessOutput,
  CanonicalizeOutput,
  WriteSessionsInput,
  WriteSessionsOutput,
  parseModelJson,
} from '../../../src/ai/contracts.ts';
import { localCanonicalize } from '../../../src/ai/localCanonicalize.ts';
import {
  assessPrompt,
  canonicalizePrompt,
  writeSessionsPrompt,
} from '../../../src/ai/prompts.ts';

const MODEL = 'claude-sonnet-5';
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

async function callModel(prompt: string, maxTokens: number): Promise<string> {
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': Deno.env.get('ANTHROPIC_API_KEY') ?? '',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) {
    throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  return data.content?.[0]?.text ?? '';
}

Deno.serve(async (req) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, content-type',
  };
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    // User-scoped client: RLS applies; unauthenticated calls fail below.
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
    );
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) {
      return json({ error: 'unauthorized' }, 401, cors);
    }

    const body = await req.json();
    const op: string = body.op;

    if (op === 'canonicalize') {
      const { rawRepText, instrument = 'harp' } = body;
      const { data: rows, error } = await supabase
        .from('excerpts')
        .select('id, slug, composer, work, movement, section_label, aliases')
        .eq('instrument', instrument);
      if (error) throw error;

      const library = rows.map((r) => ({
        excerptId: r.id as string,
        composer: r.composer as string,
        work: r.work as string,
        movement: (r.movement ?? undefined) as string | undefined,
        sectionLabel: (r.section_label ?? undefined) as string | undefined,
        aliases: r.aliases as string[],
      }));

      // Deterministic pre-pass first; the model only sees the leftovers.
      const { matched, unmatched } = localCanonicalize(rawRepText, library);
      if (unmatched.length === 0) return json({ items: matched }, 200, cors);

      const raw = await callModel(
        canonicalizePrompt({ instrument, rawRepText: unmatched.join('\n'), library }),
        4096,
      );
      const modelItems = parseModelJson(CanonicalizeOutput, raw);
      return json({ items: [...matched, ...modelItems] }, 200, cors);
    }

    if (op === 'assess') {
      const input = AssessInput.parse(body.input);
      const raw = await callModel(assessPrompt(input), 4096);
      return json({ items: parseModelJson(AssessOutput, raw) }, 200, cors);
    }

    if (op === 'write') {
      const input = WriteSessionsInput.parse(body.input);

      // RAG: pull curated knowledge for every excerpt in the batch (§5.4).
      const excerptIds = [
        ...new Set(
          input.sessions.flatMap((s) =>
            s.blocks.map((b) => b.excerptId).filter((x): x is string => !!x),
          ),
        ),
      ];
      const { data: knowledgeRows, error } = await supabase
        .from('excerpt_knowledge')
        .select(
          'excerpt_id, technical_traps, practice_strategies, committee_expectations, common_failure_modes, excerpts (composer, work)',
        )
        .in('excerpt_id', excerptIds);
      if (error) throw error;

      input.knowledge = (knowledgeRows ?? []).map((k) => ({
        excerptId: k.excerpt_id as string,
        displayName: `${(k.excerpts as { composer?: string })?.composer ?? ''} ${(k.excerpts as { work?: string })?.work ?? ''}`.trim(),
        technicalTraps: k.technical_traps as string[],
        practiceStrategies: k.practice_strategies as string[],
        committeeExpectations: (k.committee_expectations ?? undefined) as string | undefined,
        commonFailureModes: k.common_failure_modes as string[],
      }));

      const raw = await callModel(writeSessionsPrompt(input), 8192);
      return json({ items: parseModelJson(WriteSessionsOutput, raw) }, 200, cors);
    }

    return json({ error: `unknown op: ${op}` }, 400, cors);
  } catch (err) {
    return json({ error: String(err) }, 500, cors);
  }
});

function json(payload: unknown, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json', ...cors },
  });
}
