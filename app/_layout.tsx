import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { View } from 'react-native';

import { useSession } from '../src/lib/hooks';
import { colors } from '../src/theme';

export default function RootLayout() {
  const { session, ready } = useSession();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (!ready) return;
    const onAuthScreen = segments[0] === 'sign-in';
    if (!session && !onAuthScreen) {
      router.replace('/sign-in');
    } else if (session && onAuthScreen) {
      router.replace('/');
    }
  }, [ready, session, segments, router]);

  if (!ready) {
    return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  }

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.text,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        <Stack.Screen name="audition/new" options={{ title: 'New audition', presentation: 'modal' }} />
        <Stack.Screen name="audition/[id]" options={{ title: 'Audition' }} />
        <Stack.Screen name="excerpt/[id]" options={{ title: 'Excerpt' }} />
        <Stack.Screen name="overlap" options={{ title: 'Overlap analysis' }} />
        <Stack.Screen name="profile-setup" options={{ title: 'Practice profile' }} />
        <Stack.Screen name="mock" options={{ title: 'Mock audition' }} />
      </Stack>
    </>
  );
}
