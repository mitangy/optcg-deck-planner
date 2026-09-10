import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { intentLabel, type Intent } from "../net/protocol";

type Props = {
  intents: Intent[];
  disabled?: boolean;
  filterHandIndex?: number | null;
  onSend: (intent: Intent) => void;
};

function matchesHandFilter(intent: Intent, handIndex: number | null | undefined): boolean {
  if (handIndex == null) return true;
  if (typeof intent.handIndex === "number") return intent.handIndex === handIndex;
  return true;
}

export function IntentBar({ intents, disabled, filterHandIndex, onSend }: Props) {
  const shown = intents.filter((i) => matchesHandFilter(i, filterHandIndex));

  if (shown.length === 0) {
    return (
      <View style={styles.wrap}>
        <Text style={styles.empty}>No legal actions right now</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Actions</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {shown.map((intent, idx) => (
          <Pressable
            key={`${intent.type}-${idx}`}
            disabled={disabled}
            onPress={() => onSend(intent)}
            style={[styles.btn, disabled ? styles.btnDisabled : null]}
          >
            <Text style={styles.btnText}>{intentLabel(intent)}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#37474f",
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: "#0d1b22",
  },
  title: { color: "#90a4ae", fontSize: 11, marginBottom: 6, fontWeight: "600" },
  empty: { color: "#78909c", fontSize: 12 },
  row: { gap: 8, paddingRight: 12 },
  btn: {
    backgroundColor: "#1b5e20",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    minHeight: 40,
    justifyContent: "center",
  },
  btnDisabled: { opacity: 0.4 },
  btnText: { color: "#fff", fontSize: 12, fontWeight: "700" },
});
