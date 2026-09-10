import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React from "react";
import { DuelSessionProvider } from "../src/state/DuelSession";

export default function RootLayout() {
  return (
    <DuelSessionProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: "#0d1b22" },
          headerTintColor: "#eceff1",
          contentStyle: { backgroundColor: "#071016" },
        }}
      >
        <Stack.Screen name="index" options={{ title: "OPTCG Duel" }} />
        <Stack.Screen name="duel" options={{ title: "Duel", headerBackVisible: false }} />
      </Stack>
    </DuelSessionProvider>
  );
}
