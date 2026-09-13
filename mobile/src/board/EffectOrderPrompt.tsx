import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { lookupCard } from "../cards/atlas";
import type { Intent, PendingChoiceView } from "../net/protocol";

type Props = {
  choice: PendingChoiceView;
  onSend: (intent: Intent) => void;
};

/**
 * Mobile reorder UI for simultaneous effects (protocol v3 `order_effects`).
 * Remount with key={choice.id} so local order state resets per window.
 */
export function EffectOrderPrompt({ choice, onSend }: Props) {
  const initial = choice.unorderedChoices ?? [];
  const [order, setOrder] = useState<PendingChoiceView[]>(() => [...initial]);

  const labels = useMemo(
    () =>
      order.map((c) => ({
        id: c.id,
        title: lookupCard(c.cardDefId).name || c.cardDefId,
        detail: c.prompt ?? "",
      })),
    [order],
  );

  function move(index: number, dir: -1 | 1) {
    const next = index + dir;
    if (next < 0 || next >= order.length) return;
    setOrder((prev) => {
      const copy = [...prev];
      const tmp = copy[index]!;
      copy[index] = copy[next]!;
      copy[next] = tmp;
      return copy;
    });
  }

  function confirm() {
    onSend({
      type: "order_pending_effects",
      orderedIds: order.map((c) => c.id),
    });
  }

  return (
    <View style={styles.wrap} accessibilityRole="summary">
      <Text style={styles.title}>Order simultaneous effects</Text>
      {choice.prompt ? <Text style={styles.prompt}>{choice.prompt}</Text> : null}
      <Text style={styles.hint}>Resolve top to bottom</Text>
      {labels.map((row, index) => (
        <View key={row.id} style={styles.row}>
          <View style={styles.textCol}>
            <Text style={styles.cardName}>{row.title}</Text>
            {row.detail ? <Text style={styles.detail}>{row.detail}</Text> : null}
          </View>
          <View style={styles.moves}>
            <Pressable
              disabled={index === 0}
              onPress={() => move(index, -1)}
              style={[styles.chip, index === 0 ? styles.chipDisabled : null]}
              accessibilityLabel={`Move ${row.title} up`}
            >
              <Text style={styles.chipText}>Up</Text>
            </Pressable>
            <Pressable
              disabled={index === labels.length - 1}
              onPress={() => move(index, 1)}
              style={[
                styles.chip,
                index === labels.length - 1 ? styles.chipDisabled : null,
              ]}
              accessibilityLabel={`Move ${row.title} down`}
            >
              <Text style={styles.chipText}>Down</Text>
            </Pressable>
          </View>
        </View>
      ))}
      <Pressable onPress={confirm} style={styles.confirm}>
        <Text style={styles.confirmText}>Confirm order</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginVertical: 10,
    padding: 12,
    borderRadius: 10,
    backgroundColor: "#102027",
    borderWidth: 1,
    borderColor: "#455a64",
    gap: 8,
  },
  title: { color: "#ffe082", fontSize: 14, fontWeight: "800" },
  prompt: { color: "#cfd8dc", fontSize: 12, lineHeight: 17 },
  hint: {
    color: "#90a4ae",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: "#0d1b22",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#37474f",
  },
  textCol: { flex: 1, minWidth: 0, gap: 2 },
  cardName: { color: "#eceff1", fontSize: 13, fontWeight: "700" },
  detail: { color: "#b0bec5", fontSize: 11, lineHeight: 15 },
  moves: { gap: 6 },
  chip: {
    backgroundColor: "#37474f",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    minWidth: 48,
    alignItems: "center",
  },
  chipDisabled: { opacity: 0.35 },
  chipText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  confirm: {
    marginTop: 4,
    backgroundColor: "#1b5e20",
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  confirmText: { color: "#fff", fontSize: 13, fontWeight: "800" },
});
