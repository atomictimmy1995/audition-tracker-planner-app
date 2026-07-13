import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, StyleSheet, TextInput } from 'react-native';

import { Button, Dim, Screen, Title } from '../../src/components/ui';
import { useSession } from '../../src/lib/hooks';
import { supabase } from '../../src/lib/supabase';
import { colors, radius, spacing } from '../../src/theme';

export default function NewAudition() {
  const { session } = useSession();
  const router = useRouter();
  const [name, setName] = useState('');
  const [ensemble, setEnsemble] = useState('');
  const [date, setDate] = useState('');
  const [deadline, setDeadline] = useState('');
  const [busy, setBusy] = useState(false);

  const dateOk = (v: string) => v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v);

  async function save() {
    if (!session) return;
    setBusy(true);
    const { data, error } = await supabase
      .from('auditions')
      .insert({
        user_id: session.user.id,
        name,
        ensemble: ensemble || null,
        audition_date: date || null,
        application_deadline: deadline || null,
      })
      .select('id')
      .single();
    setBusy(false);
    if (error) {
      Alert.alert('Could not save', error.message);
      return;
    }
    router.replace({ pathname: '/audition/[id]', params: { id: data.id } });
  }

  return (
    <Screen>
      <Title>New audition</Title>
      <TextInput
        style={styles.input}
        placeholder="Name (e.g. Omaha Symphony — Principal Harp)"
        placeholderTextColor={colors.textFaint}
        value={name}
        onChangeText={setName}
      />
      <TextInput
        style={styles.input}
        placeholder="Ensemble"
        placeholderTextColor={colors.textFaint}
        value={ensemble}
        onChangeText={setEnsemble}
      />
      <TextInput
        style={styles.input}
        placeholder="Audition date (YYYY-MM-DD)"
        placeholderTextColor={colors.textFaint}
        value={date}
        onChangeText={setDate}
        autoCapitalize="none"
      />
      <TextInput
        style={styles.input}
        placeholder="Application deadline (YYYY-MM-DD)"
        placeholderTextColor={colors.textFaint}
        value={deadline}
        onChangeText={setDeadline}
        autoCapitalize="none"
      />
      {!dateOk(date) || !dateOk(deadline) ? <Dim>Dates need the YYYY-MM-DD format.</Dim> : null}
      <Button
        label="Create"
        onPress={save}
        loading={busy}
        disabled={!name || !dateOk(date) || !dateOk(deadline)}
      />
      <Dim style={{ marginTop: spacing.sm }}>
        Next: paste the rep list on the audition page — Advance canonicalizes it and finds the
        overlap with your other auditions.
      </Dim>
    </Screen>
  );
}

const styles = StyleSheet.create({
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    color: colors.text,
    padding: 14,
    marginBottom: spacing.sm,
    fontSize: 15,
  },
});
