/**
 * Readiness dashboard (spec §3.6): % of list at tempo, days remaining,
 * honest status per audition. Honest ≠ harsh — no shaming, ever (§8).
 */

import { Link, useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback } from 'react';
import { Text, View } from 'react-native';

import {
  Button,
  Card,
  Chip,
  Dim,
  EmptyState,
  Heading,
  ProgressBar,
  Row,
  Screen,
  Title,
} from '../../src/components/ui';
import type { AuditionRow, ExcerptCardRow, RepListItemRow } from '../../src/lib/db';
import { useAsync, useSession } from '../../src/lib/hooks';
import { supabase } from '../../src/lib/supabase';
import { colors, spacing, statusMeta, type } from '../../src/theme';

function daysUntil(date: string): number {
  return Math.ceil((new Date(date + 'T00:00:00Z').getTime() - Date.now()) / 86_400_000);
}

export default function Dashboard() {
  const { session } = useSession();
  const router = useRouter();
  const userId = session?.user.id;

  const { data, reload } = useAsync(async () => {
    if (!userId) return null;
    const [auditions, cards, repItems] = await Promise.all([
      supabase
        .from('auditions')
        .select('*')
        .eq('user_id', userId)
        .neq('status', 'result')
        .order('audition_date', { ascending: true }),
      supabase.from('excerpt_cards').select('*').eq('user_id', userId),
      supabase.from('rep_list_items').select('*, auditions!inner(user_id)').eq('auditions.user_id', userId),
    ]);
    return {
      auditions: (auditions.data ?? []) as AuditionRow[],
      cards: (cards.data ?? []) as ExcerptCardRow[],
      repItems: (repItems.data ?? []) as RepListItemRow[],
    };
  }, [userId]);

  useFocusEffect(useCallback(() => reload(), [reload]));

  const cardsByExcerpt = new Map((data?.cards ?? []).map((c) => [c.excerpt_id, c]));

  return (
    <Screen>
      <Title>Today</Title>

      {data && data.auditions.length === 0 ? (
        <>
          <EmptyState
            title="No auditions yet"
            body="Add your first audition and paste its rep list — Advance takes it from there."
          />
          <Button label="Add an audition" onPress={() => router.push('/audition/new')} />
        </>
      ) : null}

      {(data?.auditions ?? []).map((a) => {
        const rep = data!.repItems.filter((r) => r.audition_id === a.id);
        const linked = rep.filter((r) => r.excerpt_id);
        const ready = linked.filter(
          (r) => cardsByExcerpt.get(r.excerpt_id!)?.readiness === 'performance_ready',
        ).length;
        const fraction = linked.length > 0 ? ready / linked.length : 0;
        const days = a.audition_date ? daysUntil(a.audition_date) : null;
        const meta = statusMeta[a.status] ?? statusMeta.applied;

        return (
          <Link key={a.id} href={{ pathname: '/audition/[id]', params: { id: a.id } }} asChild>
            <Card>
              <Row style={{ justifyContent: 'space-between' }}>
                <Heading>{a.name}</Heading>
                <Chip label={meta.label} color={meta.color} />
              </Row>
              {days !== null ? (
                <Dim>
                  {days > 0
                    ? `${days} day${days === 1 ? '' : 's'} remaining`
                    : days === 0
                      ? 'Today.'
                      : 'Past'}
                  {a.audition_date ? ` · ${a.audition_date}` : ''}
                </Dim>
              ) : (
                <Dim>No date set yet</Dim>
              )}
              <View style={{ marginTop: spacing.sm }}>
                <ProgressBar fraction={fraction} color={colors.positive} />
                <Text style={type.small}>
                  {linked.length > 0
                    ? `${ready} of ${linked.length} excerpts performance-ready`
                    : 'Rep list not entered yet'}
                </Text>
              </View>
            </Card>
          </Link>
        );
      })}

      {data && data.auditions.length > 0 ? (
        <>
          <Button label="Overlap analysis" kind="secondary" onPress={() => router.push('/overlap')} />
          <Button label="Mock audition" kind="secondary" onPress={() => router.push('/mock')} />
        </>
      ) : null}
    </Screen>
  );
}
