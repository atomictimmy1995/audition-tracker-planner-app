/**
 * Elicitation (spec §5.3): six tapped questions, asked once, plus the
 * under-asked one — "what does a bad day look like?" — which defines the
 * minimum viable session and decides whether the plan survives week two.
 */

import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, StyleSheet, TextInput } from 'react-native';

import { Button, Card, Dim, Heading, OptionRow, Screen, Title } from '../src/components/ui';
import type { PracticeProfileRow } from '../src/lib/db';
import { useAsync, useSession } from '../src/lib/hooks';
import { supabase } from '../src/lib/supabase';
import { colors, radius, spacing } from '../src/theme';

export default function ProfileSetup() {
  const { session } = useSession();
  const router = useRouter();
  const userId = session?.user.id;

  const [days, setDays] = useState<number | null>(null);
  const [minutes, setMinutes] = useState<number | null>(null);
  const [timeOfDay, setTimeOfDay] = useState<string | null>(null);
  const [warmup, setWarmup] = useState('');
  const [closer, setCloser] = useState('');
  const [blackouts, setBlackouts] = useState('');
  const [minimum, setMinimum] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useAsync(async () => {
    if (!userId) return null;
    const { data } = await supabase
      .from('practice_profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    const p = data as PracticeProfileRow | null;
    if (p) {
      setDays(p.days_per_week);
      setMinutes(p.session_minutes);
      setTimeOfDay(p.time_of_day);
      setWarmup(p.warmup_ritual ?? '');
      setCloser(p.closing_ritual ?? '');
      setBlackouts((p.blackout_dates ?? []).join(', '));
      setMinimum(p.minimum_viable_session);
    }
    return p;
  }, [userId]);

  async function save() {
    if (!userId || days === null || minutes === null || minimum === null) return;
    setBusy(true);
    const blackoutDates = blackouts
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s));
    const { error } = await supabase.from('practice_profiles').upsert(
      {
        user_id: userId,
        days_per_week: days,
        session_minutes: minutes,
        time_of_day: timeOfDay,
        warmup_ritual: warmup || null,
        closing_ritual: closer || null,
        blackout_dates: blackoutDates,
        minimum_viable_session: minimum,
      },
      { onConflict: 'user_id' },
    );
    setBusy(false);
    if (error) {
      Alert.alert('Could not save', error.message);
      return;
    }
    router.back();
  }

  return (
    <Screen>
      <Title>Six questions</Title>
      <Dim style={{ marginBottom: spacing.md }}>
        Asked once. The plan is shaped around how you actually practice — not how anyone thinks
        you should.
      </Dim>

      <Card>
        <Heading>Days per week you realistically practice</Heading>
        <OptionRow
          options={[3, 4, 5, 6].map((n) => ({ value: n, label: String(n) }))}
          value={days}
          onChange={setDays}
        />
      </Card>

      <Card>
        <Heading>Minutes per session</Heading>
        <Dim>Honest number — the plan protects it.</Dim>
        <OptionRow
          options={[45, 60, 90, 120].map((n) => ({ value: n, label: `${n}` }))}
          value={minutes}
          onChange={setMinutes}
        />
      </Card>

      <Card>
        <Heading>Preferred time of day</Heading>
        <OptionRow
          options={[
            { value: 'morning', label: 'Morning' },
            { value: 'afternoon', label: 'Afternoon' },
            { value: 'evening', label: 'Evening' },
            { value: 'varies', label: 'It varies' },
          ]}
          value={timeOfDay}
          onChange={setTimeOfDay}
        />
      </Card>

      <Card>
        <Heading>How do you like to start?</Heading>
        <TextInput
          style={styles.input}
          placeholder="e.g. gliss warmups, then scales in the day's key"
          placeholderTextColor={colors.textFaint}
          value={warmup}
          onChangeText={setWarmup}
        />
      </Card>

      <Card>
        <Heading>How do you like to end?</Heading>
        <TextInput
          style={styles.input}
          placeholder="e.g. one slow, musical run of something I love"
          placeholderTextColor={colors.textFaint}
          value={closer}
          onChangeText={setCloser}
        />
      </Card>

      <Card>
        <Heading>Hard blackout dates</Heading>
        <Dim>Gigs, teaching, day job. YYYY-MM-DD, comma-separated.</Dim>
        <TextInput
          style={styles.input}
          placeholder="2026-09-07, 2026-09-21"
          placeholderTextColor={colors.textFaint}
          autoCapitalize="none"
          value={blackouts}
          onChangeText={setBlackouts}
        />
      </Card>

      <Card style={{ borderColor: colors.accent }}>
        <Heading>What does a bad day look like?</Heading>
        <Dim>
          The minimum you can still do when everything goes sideways. This is what keeps the plan
          alive in week two.
        </Dim>
        <OptionRow
          options={[15, 20, 30, 45].map((n) => ({ value: n, label: `${n} min` }))}
          value={minimum}
          onChange={setMinimum}
        />
      </Card>

      <Button
        label="Save profile"
        onPress={save}
        loading={busy}
        disabled={days === null || minutes === null || minimum === null}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.sm,
    color: colors.text,
    padding: 12,
    marginTop: spacing.sm,
    fontSize: 15,
  },
});
