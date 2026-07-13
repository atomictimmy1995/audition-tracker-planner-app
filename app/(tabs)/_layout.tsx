import { Tabs } from 'expo-router';
import React from 'react';
import { Text } from 'react-native';

import { colors } from '../../src/theme';

function TabIcon({ glyph, focused }: { glyph: string; focused: boolean }) {
  return <Text style={{ fontSize: 18, opacity: focused ? 1 : 0.45 }}>{glyph}</Text>;
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text,
        headerShadowVisible: false,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textFaint,
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Today',
          tabBarIcon: ({ focused }) => <TabIcon glyph="◉" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="auditions"
        options={{
          title: 'Auditions',
          tabBarIcon: ({ focused }) => <TabIcon glyph="▤" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="portfolio"
        options={{
          title: 'Portfolio',
          tabBarIcon: ({ focused }) => <TabIcon glyph="♪" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="plan"
        options={{
          title: 'Plan',
          tabBarIcon: ({ focused }) => <TabIcon glyph="⧖" focused={focused} />,
        }}
      />
    </Tabs>
  );
}
