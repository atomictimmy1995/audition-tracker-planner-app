/**
 * Audition detail: pipeline status, rep entry (paste → canonicalize →
 * confirm), and one-tap self-ratings — the scheduler's entire fuel supply
 * (spec §5.3), so it must be one tap.
 */

import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';

import { CANONICALIZE_CONFIDENCE_THRESHOLD, type CanonicalizedItem } from '../../src/ai/contracts.ts';
import {
  Button,
  Card,
  Chip,
  Dim,
  Heading,
  OptionRow,
  Row,
  Screen,
  Title,
} from '../../src/components/ui';
import {
  excerptDisplayName,
  type AuditionRow,
  type AuditionStatus,
  type ExcerptCardRow,
  type ExcerptRow,
  type RepListItemRow,
} from '../../src/lib/db';
import { useAsync, useSession } from '../../src/lib/hooks';
import { canonicalizeRep } from '../../src/lib/planPipeline';
import { supabase } from '../../src/lib/supabase';
import { colors, radius, readinessMeta, spacing, statusMeta, type } from '../../src/theme';

const STATUS_FLOW: AuditionStatus[] = [
  'applied',
  'prescreen',
  'invited',
  'prelims',
  'semis',
  'finals',
  'result',
];

const READINESS_OPTIONS = (
  ['not_started', 'learning', 'under_tempo', 'performance_ready'] as const
).map((r) => ({ value: r, label: readinessMeta[r].label }));

export default function AuditionDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const router = useRouter();
  const userId = session?.user.id;

  const [repText, setRepText] = useState('');
  const [pasting, setPasting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<CanonicalizedItem[]>([]);

  const { data, reload } = useAsync(async () => {
    if (!id || !userId) return null;
    const [audition, repItems, excerpts, cards] = await Promise.all([
      supabase.from('auditions').select('*').eq('id', id).single(),
      supabase.from('rep_list_items').select('*').eq('audition_id', id),
      supabase.from('excerpts').select('*'),
      supabase.from('excerpt_cards').select('*').eq('user_id', userId),
    ]);
    if (audition.error) throw audition.error;
    return {
      audition: audition.data as AuditionRow,
      repItems: (repItems.data ?? []) as RepListItemRow[],
      excerpts: (excerpts.data ?? []) as ExcerptRow[],
      cards: (cards.data ?? []) as ExcerptCardRow[],
    };
  }, [id, userId]);

  if (!data) return <Screen scroll={false}><View /></Screen>;

  const { audition, repItems, excerpts, cards } = data;
  const excerptById = new Map(excerpts.map((e) => [e.id, e]));
  const cardByExcerpt = new Map(cards.map((c) => [c.excerpt_id, c]));
  const meta = statusMeta[audition.status] ?? statusMeta.applied;

  async function advanceStatus() {
    const idx = STATUS_FLOW.indexOf(audition.status);
    if (idx < 0 || idx === STATUS_FLOW.length - 1) return;
    await supabase.from('auditions').update({ status: STATUS_FLOW[idx + 1] }).eq('id', audition.id);
    reload();
  }

  async function submitRep() {
    setBusy(true);
    try {
      const items = await canonicalizeRep(repText);
      const confident = items.filter(
        (i) => i.excerpt_id && i.confidence >= CANONICALIZE_CONFIDENCE_THRESHOLD,
      );
      const uncertain = items.filter(
        (i) => !i.excerpt_id || i.confidence < CANONICALIZE_CONFIDENCE_THRESHOLD,
      );
      if (confident.length > 0) {
        await insertRepItems(confident);
      }
      setPending(uncertain); // surfaced for confirmation, never silently guessed
      setRepText('');
      setPasting(false);
      reload();
    } catch (e) {
      Alert.alert('Could not parse rep list', String((e as Error).message ?? e));
    } finally {
      setBusy(false);
    }
  }

  async function insertRepItems(items: CanonicalizedItem[]) {
    const { error } = await supabase.from('rep_list_items').insert(
      items.map((i) => ({
        audition_id: audition.id,
        excerpt_id: i.excerpt_id,
        raw_text: i.raw_text,
      })),
    );
    if (error) throw error;
    // Auto-create portfolio cards for newly linked excerpts.
    for (const i of items) {
      if (i.excerpt_id && !cardByExcerpt.has(i.excerpt_id)) {
        await supabase
          .from('excerpt_cards')
          .upsert(
            { user_id: userId, excerpt_id: i.excerpt_id },
            { onConflict: 'user_id,excerpt_id', ignoreDuplicates: true },
          );
      }
    }
  }

  async function confirmPending(item: CanonicalizedItem, excerptId: string | null) {
    await insertRepItems([{ ...item, excerpt_id: excerptId, confidence: 1 }]);
    setPending((p) => p.filter((x) => x !== item));
    reload();
  }

  async function rate(excerptId: string, readiness: ExcerptCardRow['readiness']) {
    await supabase
      .from('excerpt_cards')
      .upsert(
        { user_id: userId, excerpt_id: excerptId, readiness, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,excerpt_id' },
      );
    reload();
  }

  return (
    <Screen>
      <Title>{audition.name}</Title>
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <Dim>
            {[audition.ensemble, audition.audition_date].filter(Boolean).join(' · ') || 'No date yet'}
          </Dim>
          <Chip label={meta.label} color={meta.color} />
        </Row>
        {audition.status !== 'result' ? (
          <Button label={`Advance to ${STATUS_FLOW[STATUS_FLOW.indexOf(audition.status) + 1]}`} kind="secondary" onPress={advanceStatus} />
        ) : null}
      </Card>

      <Heading>Rep list</Heading>
      {repItems.length === 0 && !pasting ? (
        <Dim style={{ marginBottom: spacing.sm }}>
          Paste the published rep list — most orchestras post one. Advance matches each line to
          its canonical excerpt.
        </Dim>
      ) : null}

      {pasting ? (
        <Card>
          <TextInput
            style={styles.repInput}
            placeholder={'Paste the list, one item per line…\nBerlioz Symphonie fantastique\nNutcracker cadenza\n…'}
            placeholderTextColor={colors.textFaint}
            multiline
            value={repText}
            onChangeText={setRepText}
          />
          <Button label="Parse rep list" onPress={submitRep} loading={busy} disabled={repText.trim().length < 3} />
        </Card>
      ) : (
        <Button label="Paste rep list" onPress={() => setPasting(true)} />
      )}

      {pending.map((item) => (
        <Card key={item.raw_text} style={{ borderColor: colors.caution }}>
          <Text style={type.body}>“{item.raw_text}”</Text>
          <Dim>
            {item.excerpt_id
              ? `Best guess: ${excerptById.get(item.excerpt_id) ? excerptDisplayName(excerptById.get(item.excerpt_id)!) : item.excerpt_id} — confirm?`
              : 'No confident match in the library.'}
          </Dim>
          <Row>
            {item.excerpt_id ? (
              <Button label="Confirm" onPress={() => confirmPending(item, item.excerpt_id)} />
            ) : null}
            <Button label="Keep as text" kind="secondary" onPress={() => confirmPending(item, null)} />
          </Row>
        </Card>
      ))}

      {repItems.map((r) => {
        const excerpt = r.excerpt_id ? excerptById.get(r.excerpt_id) : null;
        const card = r.excerpt_id ? cardByExcerpt.get(r.excerpt_id) : null;
        return (
          <Card key={r.id}>
            <Text style={type.body}>{excerpt ? excerptDisplayName(excerpt) : r.raw_text}</Text>
            {excerpt ? (
              <>
                <Dim>One tap — how is it right now?</Dim>
                <OptionRow
                  options={READINESS_OPTIONS}
                  value={card?.readiness ?? null}
                  onChange={(v) => rate(r.excerpt_id!, v)}
                />
              </>
            ) : (
              <Dim>Not in the library yet — tracked as free text.</Dim>
            )}
          </Card>
        );
      })}

      {repItems.length > 0 ? (
        <Button label="See overlap across auditions" kind="secondary" onPress={() => router.push('/overlap')} />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  repInput: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.sm,
    color: colors.text,
    padding: 12,
    minHeight: 120,
    textAlignVertical: 'top',
    marginBottom: spacing.sm,
    fontSize: 15,
  },
});
