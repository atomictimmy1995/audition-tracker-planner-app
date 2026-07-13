/**
 * The overlap payoff screen (spec §5.3 + §7): the first thing that earns
 * trust, fired before any profile questions. Pure set logic over
 * canonicalized rep — the numbers never come from a model.
 */

import React from 'react';
import { Text, View } from 'react-native';

import { Card, Chip, Dim, EmptyState, Heading, Screen, Title } from '../src/components/ui';
import { excerptDisplayName, type AuditionRow, type ExcerptRow, type RepListItemRow } from '../src/lib/db';
import { useAsync, useSession } from '../src/lib/hooks';
import { supabase } from '../src/lib/supabase';
import { analyzeOverlap, overlapSummary } from '../src/scheduler/overlap.ts';
import { colors, spacing, type } from '../src/theme';

export default function Overlap() {
  const { session } = useSession();
  const userId = session?.user.id;

  const { data } = useAsync(async () => {
    if (!userId) return null;
    const [auditions, repItems, excerpts] = await Promise.all([
      supabase.from('auditions').select('*').eq('user_id', userId).neq('status', 'result'),
      supabase.from('rep_list_items').select('*, auditions!inner(user_id)').eq('auditions.user_id', userId),
      supabase.from('excerpts').select('*'),
    ]);
    return {
      auditions: (auditions.data ?? []) as AuditionRow[],
      repItems: (repItems.data ?? []) as RepListItemRow[],
      excerpts: (excerpts.data ?? []) as ExcerptRow[],
    };
  }, [userId]);

  if (!data) return <Screen scroll={false}><View /></Screen>;

  const excerptById = new Map(data.excerpts.map((e) => [e.id, e]));
  const auditionById = new Map(data.auditions.map((a) => [a.id, a]));

  const overlap = analyzeOverlap(
    data.auditions.map((a) => ({
      id: a.id,
      name: a.name,
      auditionDate: a.audition_date ?? '9999-12-31',
      repExcerptIds: data.repItems
        .filter((r) => r.audition_id === a.id && r.excerpt_id)
        .map((r) => r.excerpt_id!),
    })),
  );

  const names: Record<string, string> = {};
  for (const [id, e] of excerptById) names[id] = `${e.composer} ${e.work}`;

  if (overlap.totalLineItems === 0) {
    return (
      <Screen>
        <Title>Overlap</Title>
        <EmptyState
          title="No rep entered yet"
          body="Paste rep lists into your auditions first — then this screen shows what they share."
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <Title>What your lists share</Title>
      <Card style={{ borderColor: colors.accent }}>
        <Text style={[type.body, { fontSize: 17, lineHeight: 26 }]}>
          {overlapSummary(overlap, data.auditions.length, names)}
        </Text>
      </Card>

      {overlap.spine.length > 0 ? (
        <>
          <Heading>The spine — shared rep</Heading>
          <Dim style={{ marginBottom: spacing.sm }}>
            High rotation, prepared to the earliest deadline's standard.
          </Dim>
          {overlap.spine.map((s) => {
            const e = excerptById.get(s.excerptId);
            return (
              <Card key={s.excerptId}>
                <Text style={type.body}>{e ? excerptDisplayName(e) : s.excerptId}</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                  {s.auditionIds.map((aid) => (
                    <Chip key={aid} label={auditionById.get(aid)?.name ?? aid} color={colors.accent} soft={colors.accentSoft} />
                  ))}
                </View>
              </Card>
            );
          })}
        </>
      ) : null}

      {overlap.orphans.length > 0 ? (
        <>
          <Heading>Just-in-time — single-audition rep</Heading>
          <Dim style={{ marginBottom: spacing.sm }}>
            Ramped ahead of the one audition that needs it, not carried all season.
          </Dim>
          {overlap.orphans.map((o) => {
            const e = excerptById.get(o.excerptId);
            return (
              <Card key={o.excerptId}>
                <Text style={type.body}>{e ? excerptDisplayName(e) : o.excerptId}</Text>
                <Dim>{auditionById.get(o.auditionId)?.name ?? ''}</Dim>
              </Card>
            );
          })}
        </>
      ) : null}
    </Screen>
  );
}
