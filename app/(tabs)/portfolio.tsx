/**
 * Excerpt portfolio (spec §3.2): a persistent card per excerpt, surviving
 * across auditions and years.
 */

import { Link, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, Text, TextInput, View } from 'react-native';

import {
  Button,
  Card,
  Chip,
  Dim,
  EmptyState,
  Heading,
  Row,
  Screen,
  Title,
} from '../../src/components/ui';
import { excerptDisplayName, type ExcerptCardRow, type ExcerptRow } from '../../src/lib/db';
import { canAddExcerptCard, getEntitlements, UPGRADE_COPY } from '../../src/lib/entitlements';
import { useAsync, useSession } from '../../src/lib/hooks';
import { supabase } from '../../src/lib/supabase';
import { colors, radius, readinessMeta, spacing, type } from '../../src/theme';

export default function Portfolio() {
  const { session } = useSession();
  const userId = session?.user.id;
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);

  const { data, reload } = useAsync(async () => {
    if (!userId) return null;
    const [cards, excerpts] = await Promise.all([
      supabase.from('excerpt_cards').select('*').eq('user_id', userId).order('updated_at', { ascending: false }),
      supabase.from('excerpts').select('*').order('composer'),
    ]);
    return {
      cards: (cards.data ?? []) as ExcerptCardRow[],
      excerpts: (excerpts.data ?? []) as ExcerptRow[],
    };
  }, [userId]);

  useFocusEffect(useCallback(() => reload(), [reload]));

  const excerptById = new Map((data?.excerpts ?? []).map((e) => [e.id, e]));
  const cardExcerptIds = new Set((data?.cards ?? []).map((c) => c.excerpt_id));
  const searchable = (data?.excerpts ?? []).filter((e) => !cardExcerptIds.has(e.id));
  const results = search.length > 1
    ? searchable.filter((e) =>
        `${e.composer} ${e.work} ${e.aliases.join(' ')}`.toLowerCase().includes(search.toLowerCase()),
      ).slice(0, 8)
    : [];

  async function addCard(excerpt: ExcerptRow) {
    const ent = await getEntitlements();
    if (!canAddExcerptCard(data?.cards.length ?? 0, ent)) {
      Alert.alert('Advance Pro', UPGRADE_COPY.cards);
      return;
    }
    const { error } = await supabase.from('excerpt_cards').insert({
      user_id: userId,
      excerpt_id: excerpt.id,
    });
    if (error) Alert.alert('Could not add', error.message);
    setSearch('');
    setAdding(false);
    reload();
  }

  return (
    <Screen>
      <Title>Portfolio</Title>
      <Button label={adding ? 'Cancel' : 'Add excerpt from library'} kind={adding ? 'ghost' : 'primary'} onPress={() => setAdding(!adding)} />

      {adding ? (
        <Card>
          <TextInput
            style={{
              backgroundColor: colors.surfaceRaised,
              borderRadius: radius.sm,
              color: colors.text,
              padding: 12,
              marginBottom: spacing.sm,
            }}
            placeholder="Search the harp library…"
            placeholderTextColor={colors.textFaint}
            value={search}
            onChangeText={setSearch}
            autoFocus
          />
          {results.map((e) => (
            <View key={e.id} style={{ marginBottom: spacing.sm }}>
              <Text style={type.body}>{excerptDisplayName(e)}</Text>
              <Row>
                <Dim>Difficulty {e.difficulty}/5 · ~{e.typical_prep_weeks}w prep</Dim>
                <Button label="Add" kind="secondary" onPress={() => addCard(e)} />
              </Row>
            </View>
          ))}
          {search.length > 1 && results.length === 0 ? (
            <Dim>No match — paste it into an audition's rep list and it will be canonicalized.</Dim>
          ) : null}
        </Card>
      ) : null}

      {data && data.cards.length === 0 && !adding ? (
        <EmptyState
          title="No excerpt cards yet"
          body="Cards live forever: target tempo, readiness, notes, and every take you've ever recorded."
        />
      ) : null}

      {(data?.cards ?? []).map((card) => {
        const excerpt = excerptById.get(card.excerpt_id);
        const meta = readinessMeta[card.readiness];
        return (
          <Link key={card.id} href={{ pathname: '/excerpt/[id]', params: { id: card.id } }} asChild>
            <Card>
              <Heading>{excerpt ? excerptDisplayName(excerpt) : 'Unknown excerpt'}</Heading>
              <Row style={{ justifyContent: 'space-between' }}>
                <Chip label={meta.label} color={meta.color} soft={meta.soft} />
                <Dim>
                  {card.current_tempo && card.target_tempo
                    ? `♩ ${card.current_tempo} → ${card.target_tempo}`
                    : 'Tempo not set'}
                </Dim>
              </Row>
            </Card>
          </Link>
        );
      })}
    </Screen>
  );
}
