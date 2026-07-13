/**
 * Excerpt card: readiness, tempo ladder, notes, and every recording ever
 * made of it (spec §3.2 + §3.4). The recorder files takes straight here.
 */

import { useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';

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
  type ExcerptCardRow,
  type ExcerptRow,
  type RecordingRow,
} from '../../src/lib/db';
import { useAsync, useSession } from '../../src/lib/hooks';
import { fileTake, useTakeRecorder } from '../../src/lib/recorder';
import { supabase } from '../../src/lib/supabase';
import { colors, radius, readinessMeta, spacing, type } from '../../src/theme';

const READINESS_OPTIONS = (
  ['not_started', 'learning', 'under_tempo', 'performance_ready'] as const
).map((r) => ({ value: r, label: readinessMeta[r].label }));

export default function ExcerptCard() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const userId = session?.user.id;
  const recorder = useTakeRecorder();
  const [savingTake, setSavingTake] = useState(false);

  const { data, reload } = useAsync(async () => {
    if (!id) return null;
    const card = await supabase.from('excerpt_cards').select('*').eq('id', id).single();
    if (card.error) throw card.error;
    const [excerpt, recordings] = await Promise.all([
      supabase.from('excerpts').select('*').eq('id', card.data.excerpt_id).single(),
      supabase
        .from('recordings')
        .select('*')
        .eq('excerpt_card_id', id)
        .order('created_at', { ascending: false }),
    ]);
    return {
      card: card.data as ExcerptCardRow,
      excerpt: excerpt.data as ExcerptRow | null,
      recordings: (recordings.data ?? []) as RecordingRow[],
    };
  }, [id]);

  if (!data) return <Screen scroll={false}><View /></Screen>;
  const { card, excerpt, recordings } = data;

  async function update(fields: Partial<ExcerptCardRow>) {
    await supabase
      .from('excerpt_cards')
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq('id', card.id);
    reload();
  }

  async function toggleRecording() {
    try {
      if (recorder.isRecording) {
        setSavingTake(true);
        const uri = await recorder.stop();
        await fileTake({
          userId: userId!,
          localUri: uri,
          excerptCardId: card.id,
          durationSecs: Math.round((recorder.durationMillis ?? 0) / 1000),
        });
        reload();
      } else {
        await recorder.start();
      }
    } catch (e) {
      Alert.alert('Recording', String((e as Error).message ?? e));
    } finally {
      setSavingTake(false);
    }
  }

  return (
    <Screen>
      <Title>{excerpt ? excerptDisplayName(excerpt) : 'Excerpt'}</Title>
      {excerpt ? (
        <Row style={{ marginBottom: spacing.md }}>
          <Chip label={`Difficulty ${excerpt.difficulty}/5`} />
          <Chip label={`~${excerpt.typical_prep_weeks}w typical prep`} />
        </Row>
      ) : null}

      <Card>
        <Heading>Readiness</Heading>
        <OptionRow
          options={READINESS_OPTIONS}
          value={card.readiness}
          onChange={(v) => update({ readiness: v })}
        />
      </Card>

      <Card>
        <Heading>Tempo</Heading>
        <Row>
          <TempoField
            label="Current ♩"
            value={card.current_tempo}
            onCommit={(v) => update({ current_tempo: v })}
          />
          <TempoField
            label="Target ♩"
            value={card.target_tempo}
            onCommit={(v) => update({ target_tempo: v })}
          />
        </Row>
      </Card>

      <Card>
        <Heading>Notes</Heading>
        <TextInput
          style={styles.notes}
          multiline
          placeholder="Fingerings, pedal markings, what your teacher said…"
          placeholderTextColor={colors.textFaint}
          defaultValue={card.notes ?? ''}
          onEndEditing={(e) => update({ notes: e.nativeEvent.text })}
        />
      </Card>

      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <Heading>Takes</Heading>
          <Button
            label={
              savingTake ? 'Saving…' : recorder.isRecording ? '■ Stop & file' : '● Record take'
            }
            kind={recorder.isRecording ? 'destructive' : 'primary'}
            onPress={toggleRecording}
            loading={savingTake}
          />
        </Row>
        {recorder.isRecording ? (
          <Dim>Recording… {Math.round((recorder.durationMillis ?? 0) / 1000)}s</Dim>
        ) : null}
        {recordings.length === 0 && !recorder.isRecording ? (
          <Dim>No takes yet. Every recording files itself here — no more unnamed voice memos.</Dim>
        ) : null}
        {recordings.map((r) => (
          <View key={r.id} style={styles.take}>
            <Text style={type.body}>Take {r.take_number}</Text>
            <Dim>
              {r.created_at.slice(0, 10)}
              {r.duration_secs ? ` · ${r.duration_secs}s` : ''}
            </Dim>
          </View>
        ))}
      </Card>
    </Screen>
  );
}

function TempoField({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: number | null;
  onCommit: (v: number | null) => void;
}) {
  return (
    <View style={{ flex: 1 }}>
      <Dim>{label}</Dim>
      <TextInput
        style={styles.tempo}
        keyboardType="number-pad"
        defaultValue={value ? String(value) : ''}
        placeholder="—"
        placeholderTextColor={colors.textFaint}
        onEndEditing={(e) => {
          const n = parseInt(e.nativeEvent.text, 10);
          onCommit(Number.isFinite(n) && n > 0 ? n : null);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  notes: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.sm,
    color: colors.text,
    padding: 12,
    minHeight: 80,
    textAlignVertical: 'top',
    fontSize: 15,
  },
  tempo: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.sm,
    color: colors.text,
    padding: 10,
    fontSize: 18,
    fontWeight: '600',
    marginTop: 4,
  },
  take: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingVertical: spacing.sm,
  },
});
