/** Small shared UI kit — no external component libraries. */

import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, radius, spacing, type } from '../theme';

export function Screen({
  children,
  scroll = true,
  padded = true,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  padded?: boolean;
}) {
  const inner = padded ? { padding: spacing.md, paddingBottom: spacing.xl } : undefined;
  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      {scroll ? (
        <ScrollView contentContainerStyle={inner} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, inner]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Title({ children }: { children: React.ReactNode }) {
  return <Text style={[type.title, { marginBottom: spacing.md }]}>{children}</Text>;
}

export function Heading({ children }: { children: React.ReactNode }) {
  return <Text style={[type.heading, { marginBottom: spacing.sm }]}>{children}</Text>;
}

export function Dim({ children, style }: { children: React.ReactNode; style?: object }) {
  return <Text style={[type.dim, style]}>{children}</Text>;
}

export function Button({
  label,
  onPress,
  kind = 'primary',
  disabled,
  loading,
}: {
  label: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'ghost' | 'destructive';
  disabled?: boolean;
  loading?: boolean;
}) {
  const bg =
    kind === 'primary' ? colors.accent
    : kind === 'destructive' ? colors.danger
    : kind === 'secondary' ? colors.surfaceRaised
    : 'transparent';
  const fg = kind === 'primary' || kind === 'destructive' ? colors.bg : colors.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: disabled ? 0.4 : pressed ? 0.8 : 1 },
        kind === 'ghost' && { borderWidth: 1, borderColor: colors.border },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Text style={{ color: fg, fontWeight: '600', fontSize: 15 }}>{label}</Text>
      )}
    </Pressable>
  );
}

export function Chip({
  label,
  color = colors.textDim,
  soft = colors.surfaceRaised,
}: {
  label: string;
  color?: string;
  soft?: string;
}) {
  return (
    <View style={[styles.chip, { backgroundColor: soft }]}>
      <Text style={{ color, fontSize: 12, fontWeight: '600' }}>{label}</Text>
    </View>
  );
}

/** One-tap option row — elicitation is tappable, never a chat box (§5.3). */
export function OptionRow<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string }>;
  value: T | null;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.optionRow}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={String(opt.value)}
            onPress={() => onChange(opt.value)}
            style={[
              styles.option,
              active && { backgroundColor: colors.accentSoft, borderColor: colors.accent },
            ]}
          >
            <Text style={{ color: active ? colors.accent : colors.textDim, fontWeight: '600', fontSize: 14 }}>
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function ProgressBar({ fraction, color = colors.accent }: { fraction: number; color?: string }) {
  return (
    <View style={styles.progressTrack}>
      <View
        style={[
          styles.progressFill,
          { width: `${Math.round(Math.max(0, Math.min(1, fraction)) * 100)}%`, backgroundColor: color },
        ]}
      />
    </View>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <Card style={{ alignItems: 'center', paddingVertical: spacing.xl }}>
      <Text style={[type.heading, { marginBottom: spacing.xs }]}>{title}</Text>
      <Text style={[type.dim, { textAlign: 'center' }]}>{body}</Text>
    </Card>
  );
}

export function Row({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  button: {
    borderRadius: radius.sm,
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: spacing.xs,
  },
  chip: {
    borderRadius: radius.pill,
    paddingVertical: 4,
    paddingHorizontal: 10,
    alignSelf: 'flex-start',
  },
  optionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginVertical: spacing.sm },
  option: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.surfaceRaised,
    overflow: 'hidden',
    marginVertical: spacing.xs,
  },
  progressFill: { height: 6, borderRadius: 3 },
});
