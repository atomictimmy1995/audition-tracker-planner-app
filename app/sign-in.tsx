import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { Button, Dim, Screen } from '../src/components/ui';
import { supabase } from '../src/lib/supabase';
import { colors, radius, spacing, type } from '../src/theme';

export default function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'sign_in' | 'sign_up'>('sign_in');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setMessage(null);
    try {
      const { error } =
        mode === 'sign_in'
          ? await supabase.auth.signInWithPassword({ email, password })
          : await supabase.auth.signUp({ email, password });
      if (error) setMessage(error.message);
      else if (mode === 'sign_up') setMessage('Check your email to confirm your account.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen scroll={false}>
      <View style={styles.center}>
        <Text style={[type.title, { marginBottom: 4 }]}>Advance</Text>
        <Dim style={{ marginBottom: spacing.xl }}>
          Every deadline, excerpt, and practice day. One place.
        </Dim>

        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor={colors.textFaint}
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor={colors.textFaint}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        {message ? <Dim style={{ marginVertical: spacing.sm }}>{message}</Dim> : null}

        <Button
          label={mode === 'sign_in' ? 'Sign in' : 'Create account'}
          onPress={submit}
          loading={busy}
          disabled={!email || password.length < 6}
        />
        <Button
          label={mode === 'sign_in' ? 'New here? Create an account' : 'Have an account? Sign in'}
          kind="ghost"
          onPress={() => setMode(mode === 'sign_in' ? 'sign_up' : 'sign_in')}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', padding: spacing.md },
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
