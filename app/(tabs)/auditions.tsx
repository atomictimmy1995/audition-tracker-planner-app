/** Audition pipeline (spec §3.1): each audition is a project. */

import { Link, useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback } from 'react';
import { Alert } from 'react-native';

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
import type { AuditionRow } from '../../src/lib/db';
import { canAddAudition, getEntitlements, UPGRADE_COPY } from '../../src/lib/entitlements';
import { useAsync, useSession } from '../../src/lib/hooks';
import { supabase } from '../../src/lib/supabase';
import { statusMeta } from '../../src/theme';

export default function Auditions() {
  const { session } = useSession();
  const router = useRouter();
  const userId = session?.user.id;

  const { data: auditions, reload } = useAsync(async () => {
    if (!userId) return [];
    const { data, error } = await supabase
      .from('auditions')
      .select('*')
      .eq('user_id', userId)
      .order('audition_date', { ascending: true, nullsFirst: false });
    if (error) throw error;
    return (data ?? []) as AuditionRow[];
  }, [userId]);

  useFocusEffect(useCallback(() => reload(), [reload]));

  async function addAudition() {
    const active = (auditions ?? []).filter((a) => a.status !== 'result').length;
    const ent = await getEntitlements();
    if (!canAddAudition(active, ent)) {
      Alert.alert('Advance Pro', UPGRADE_COPY.auditions);
      return;
    }
    router.push('/audition/new');
  }

  const upcoming = (auditions ?? []).filter((a) => a.status !== 'result');
  const past = (auditions ?? []).filter((a) => a.status === 'result');

  return (
    <Screen>
      <Title>Auditions</Title>
      <Button label="Add audition" onPress={addAudition} />

      {auditions && auditions.length === 0 ? (
        <EmptyState
          title="Your pipeline is empty"
          body="Every audition you take becomes a project here: deadlines, rounds, rep, results."
        />
      ) : null}

      {upcoming.map((a) => (
        <AuditionCard key={a.id} audition={a} />
      ))}

      {past.length > 0 ? (
        <>
          <Heading>Career history</Heading>
          {past.map((a) => (
            <AuditionCard key={a.id} audition={a} />
          ))}
        </>
      ) : null}
    </Screen>
  );
}

function AuditionCard({ audition }: { audition: AuditionRow }) {
  const meta = statusMeta[audition.status] ?? statusMeta.applied;
  return (
    <Link href={{ pathname: '/audition/[id]', params: { id: audition.id } }} asChild>
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <Heading>{audition.name}</Heading>
          <Chip label={audition.result ?? meta.label} color={meta.color} />
        </Row>
        <Dim>
          {[audition.ensemble, audition.audition_date].filter(Boolean).join(' · ') || 'Details pending'}
        </Dim>
        {audition.application_deadline ? (
          <Dim>Application due {audition.application_deadline}</Dim>
        ) : null}
      </Card>
    </Link>
  );
}
