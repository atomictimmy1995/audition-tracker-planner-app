/**
 * Mock audition mode (spec §3.5): shuffles the list, times transitions,
 * records the full run. Nothing on the market does this.
 *
 * Phase 6 TODO: auto-split the recording by excerpt using the transition
 * timestamps captured below, and optional proctor voice prompts.
 */

import { useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
import { Alert, Text, View } from 'react-native';

import { Button, Card, Chip, Dim, EmptyState, Heading, Screen, Title } from '../src/components/ui';
import { excerptDisplayName, type AuditionRow, type ExcerptRow, type RepListItemRow } from '../src/lib/db';
import { useAsync, useSession } from '../src/lib/hooks';
import { fileTake, useTakeRecorder } from '../src/lib/recorder';
import { supabase } from '../src/lib/supabase';
import { seededShuffle } from '../src/scheduler/engine.ts';
import { colors, spacing, type } from '../src/theme';

const TRANSITION_SECONDS = 20; // committee-style reset between excerpts

export default function MockAudition() {
  const { session } = useSession();
  const router = useRouter();
  const userId = session?.user.id;
  const recorder = useTakeRecorder();

  const [auditionId, setAuditionId] = useState<string | null>(null);
  const [order, setOrder] = useState<string[]>([]);
  const [position, setPosition] = useState(0);
  const [running, setRunning] = useState(false);
  const [inTransition, setInTransition] = useState(false);
  const [countdown, setCountdown] = useState(0);
  /** Timestamps (ms into recording) of each excerpt start — the split map. */
  const splitPoints = useRef<Array<{ excerptId: string; atMillis: number }>>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

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

  const excerptById = new Map((data?.excerpts ?? []).map((e) => [e.id, e]));

  async function begin(audition: AuditionRow) {
    const ids = (data?.repItems ?? [])
      .filter((r) => r.audition_id === audition.id && r.excerpt_id)
      .map((r) => r.excerpt_id!);
    if (ids.length === 0) {
      Alert.alert('No rep', 'Enter this audition’s rep list first.');
      return;
    }
    try {
      await recorder.start();
    } catch (e) {
      Alert.alert('Microphone', String((e as Error).message ?? e));
      return;
    }
    const shuffled = seededShuffle(ids, `${audition.id}:${Date.now()}`);
    splitPoints.current = [{ excerptId: shuffled[0], atMillis: 0 }];
    setAuditionId(audition.id);
    setOrder(shuffled);
    setPosition(0);
    setRunning(true);
  }

  function nextExcerpt() {
    if (position + 1 >= order.length) {
      void finish();
      return;
    }
    setInTransition(true);
    setCountdown(TRANSITION_SECONDS);
    timer.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          if (timer.current) clearInterval(timer.current);
          setInTransition(false);
          setPosition((p) => {
            const next = p + 1;
            splitPoints.current.push({
              excerptId: order[next],
              atMillis: recorder.durationMillis ?? 0,
            });
            return next;
          });
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  }

  async function finish() {
    setRunning(false);
    try {
      const uri = await recorder.stop();
      const { data: mockRow, error } = await supabase
        .from('mock_sessions')
        .insert({ user_id: userId, audition_id: auditionId })
        .select('id')
        .single();
      if (error) throw error;
      await fileTake({
        userId: userId!,
        localUri: uri,
        mockSessionId: mockRow.id,
        durationSecs: Math.round((recorder.durationMillis ?? 0) / 1000),
      });
      Alert.alert(
        'Run recorded',
        `Full run saved (${splitPoints.current.length} excerpts marked). Per-excerpt splitting lands in a coming update.`,
        [{ text: 'OK', onPress: () => router.back() }],
      );
    } catch (e) {
      Alert.alert('Could not save run', String((e as Error).message ?? e));
    }
  }

  if (running) {
    const currentId = order[position];
    const excerpt = excerptById.get(currentId);
    return (
      <Screen scroll={false}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.lg }}>
          {inTransition ? (
            <>
              <Dim>Reset. Breathe. Next up in</Dim>
              <Text style={[type.title, { fontSize: 64, marginVertical: spacing.md }]}>{countdown}</Text>
              <Text style={[type.heading, { textAlign: 'center' }]}>
                {excerptById.get(order[position + 1])
                  ? excerptDisplayName(excerptById.get(order[position + 1])!)
                  : ''}
              </Text>
            </>
          ) : (
            <>
              <Chip label={`${position + 1} of ${order.length} · recording`} color={colors.accent} soft={colors.accentSoft} />
              <Text style={[type.title, { textAlign: 'center', marginVertical: spacing.lg }]}>
                {excerpt ? excerptDisplayName(excerpt) : currentId}
              </Text>
              <Button
                label={position + 1 >= order.length ? 'Finish run' : 'Done — next excerpt'}
                onPress={nextExcerpt}
              />
              <Button label="End early" kind="ghost" onPress={finish} />
            </>
          )}
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <Title>Mock audition</Title>
      <Dim style={{ marginBottom: spacing.md }}>
        Advance shuffles the list the way a committee would, times your transitions, and records
        the whole run.
      </Dim>
      {(data?.auditions ?? []).length === 0 ? (
        <EmptyState title="No auditions" body="Add an audition with rep to run a mock round." />
      ) : null}
      {(data?.auditions ?? []).map((a) => (
        <Card key={a.id}>
          <Heading>{a.name}</Heading>
          <Dim>
            {(data?.repItems ?? []).filter((r) => r.audition_id === a.id && r.excerpt_id).length}{' '}
            excerpts on the list
          </Dim>
          <Button label="Start mock round" onPress={() => begin(a)} />
        </Card>
      ))}
    </Screen>
  );
}
