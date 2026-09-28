import React, { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { lookupCard } from "../cards/atlas";
import type { Intent, PendingChoiceView, PlayerView } from "../net/protocol";

type Props = {
  view: PlayerView;
  choice: PendingChoiceView;
  onSend: (intent: Intent) => void;
};

export function SearchPrompt({ view, choice, onSend }: Props) {
  const options = choice.search?.options ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [remainderIds, setRemainderIds] = useState(() => options.map((option) => option.id));
  const [handIndex, setHandIndex] = useState<number | null>(null);
  const byId = useMemo(() => new Map(options.map((option) => [option.id, option])), [options]);

  useEffect(() => {
    setRemainderIds(options.filter((option) => option.id !== selectedId).map((option) => option.id));
  }, [choice.id, selectedId]);

  function move(id: string, delta: -1 | 1) {
    setRemainderIds((current) => {
      const index = current.indexOf(id);
      const nextIndex = index + delta;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex]!, next[index]!];
      return next;
    });
  }

  if (choice.kind === "activate_main" && choice.abilityId === "fullalead_search_cost") {
    return (
      <View style={styles.wrap} accessibilityRole="summary">
        <Text style={styles.title}>Fullalead — activate search</Text>
        <Text style={styles.prompt}>{choice.prompt}</Text>
        <Text style={styles.label}>Trash 1 card from your hand</Text>
        <View style={styles.row}>
          {view.you.hand.map((entry, index) => (
            <Pressable
              key={entry.id}
              onPress={() => setHandIndex(index)}
              style={[styles.chip, handIndex === index ? styles.chipSelected : null]}
            >
              <Text style={styles.chipText}>{lookupCard(entry.defId).name}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.row}>
          <Pressable
            disabled={handIndex == null}
            onPress={() => onSend({ type: "resolve_pending_choice", accept: true, handIndex })}
            style={[styles.primary, handIndex == null ? styles.disabled : null]}
          >
            <Text style={styles.buttonText}>Pay cost &amp; search</Text>
          </Pressable>
          <Pressable
            onPress={() => onSend({ type: "resolve_pending_choice", accept: false })}
            style={styles.secondary}
          >
            <Text style={styles.buttonText}>Decline</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.wrap} accessibilityRole="summary">
      <Text style={styles.title}>Search the top of your deck</Text>
      <Text style={styles.prompt}>{choice.prompt}</Text>
      <Text style={styles.label}>Choose up to 1 eligible card</Text>
      <View style={styles.row}>
        {options.map((option) => (
          <Pressable
            key={option.id}
            disabled={!option.eligible}
            onPress={() => setSelectedId(selectedId === option.id ? null : option.id)}
            style={[
              styles.chip,
              selectedId === option.id ? styles.chipSelected : null,
              !option.eligible ? styles.disabled : null,
            ]}
          >
            <Text style={styles.chipText}>
              {lookupCard(option.defId).name}{!option.eligible ? " · not eligible" : ""}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.label}>
        {choice.search?.remainder === "trash"
          ? "Cards sent to trash"
          : "Order above → bottom; last row is bottommost"}
      </Text>
      {remainderIds.map((id, index) => (
        <View key={id} style={styles.orderRow}>
          <Text style={styles.chipText}>{lookupCard(byId.get(id)!.defId).name}</Text>
          <View style={styles.row}>
            <Pressable disabled={choice.search?.remainder === "trash" || index === 0} onPress={() => move(id, -1)} style={styles.arrow}>
              <Text style={styles.buttonText}>↑</Text>
            </Pressable>
            <Pressable
              disabled={choice.search?.remainder === "trash" || index === remainderIds.length - 1}
              onPress={() => move(id, 1)}
              style={styles.arrow}
            >
              <Text style={styles.buttonText}>↓</Text>
            </Pressable>
          </View>
        </View>
      ))}
      <Pressable
        onPress={() =>
          onSend({
            type: "resolve_pending_choice",
            accept: true,
            selectedOptionId: selectedId ?? undefined,
            orderedOptionIds: remainderIds,
          })
        }
        style={styles.primary}
      >
        <Text style={styles.buttonText}>{selectedId ? "Take card & finish" : "Take no card & finish"}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: "#1a237e", borderRadius: 10, padding: 12, marginVertical: 10, gap: 8 },
  title: { color: "#fff", fontSize: 15, fontWeight: "800" },
  prompt: { color: "#e8eaf6", fontSize: 12, lineHeight: 17 },
  label: { color: "#90caf9", fontSize: 11, fontWeight: "700", textTransform: "uppercase" },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { backgroundColor: "#283593", paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: "#3949ab" },
  chipSelected: { borderColor: "#ffca28", backgroundColor: "#303f9f" },
  chipText: { color: "#fff", fontSize: 12 },
  orderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  arrow: { backgroundColor: "#37474f", borderRadius: 6, paddingHorizontal: 12, paddingVertical: 7 },
  primary: { alignSelf: "flex-start", backgroundColor: "#00897b", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9 },
  secondary: { backgroundColor: "#455a64", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9 },
  buttonText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  disabled: { opacity: 0.45 },
});
