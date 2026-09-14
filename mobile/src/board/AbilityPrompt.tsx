import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { lookupCard } from "../cards/atlas";
import type { Intent, PendingChoiceView, PlayerView } from "../net/protocol";

type Props = {
  view: PlayerView;
  choice: PendingChoiceView;
  onSend: (intent: Intent) => void;
};

/**
 * Structured picker for leader attack-window abilities (Teach / Newgate / Rocks).
 * Bare Accept without handIndex / buffTargetId fails engine validation.
 * Mobile atlas lacks trigger/trait flags — show all candidates; engine validates.
 */
export function AbilityPrompt({ view, choice, onSend }: Props) {
  const [handIndex, setHandIndex] = useState<number | null>(null);
  const [buffTargetId, setBuffTargetId] = useState<string | null>(null);
  const [retargetLeader, setRetargetLeader] = useState(true);
  const [retargetCharId, setRetargetCharId] = useState<string | null>(null);

  const abilityId = choice.abilityId;

  const handOptions = useMemo(() => {
    return view.you.hand.map((c, index) => ({
      card: c,
      index,
      entry: lookupCard(c.defId),
    }));
  }, [view.you.hand]);

  const buffTargets = useMemo(
    () => [
      {
        id: view.you.leader.id,
        label: `Leader · ${lookupCard(view.you.leader.defId).name}`,
      },
      ...view.you.characters.map((ch) => ({
        id: ch.id,
        label: lookupCard(ch.defId).name,
      })),
    ],
    [view.you.leader, view.you.characters],
  );

  const retargetChars = useMemo(() => {
    return view.you.characters.map((ch) => ({
      ch,
      entry: lookupCard(ch.defId),
    }));
  }, [view.you.characters]);

  const canAccept =
    handIndex != null &&
    (abilityId === "newgate_battle_power"
      ? buffTargetId != null
      : abilityId === "teach_redirect"
        ? retargetLeader || retargetCharId != null
        : abilityId === "rocks_reveal_draw"
          ? true
          : false);

  function accept() {
    if (!canAccept || handIndex == null) return;
    if (abilityId === "newgate_battle_power" && buffTargetId) {
      onSend({
        type: "resolve_pending_choice",
        accept: true,
        handIndex,
        buffTargetId,
      });
      return;
    }
    if (abilityId === "teach_redirect") {
      onSend({
        type: "resolve_pending_choice",
        accept: true,
        handIndex,
        newTarget: retargetLeader
          ? { kind: "leader" }
          : { kind: "character", instanceId: retargetCharId! },
      });
      return;
    }
    if (abilityId === "rocks_reveal_draw") {
      onSend({
        type: "resolve_pending_choice",
        accept: true,
        handIndex,
      });
    }
  }

  const title =
    abilityId === "teach_redirect"
      ? "Teach — redirect attack"
      : abilityId === "newgate_battle_power"
        ? "Newgate — battle power"
        : abilityId === "rocks_reveal_draw"
          ? "Rocks — reveal & draw"
          : "Leader ability";

  return (
    <View style={styles.wrap} accessibilityRole="summary">
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.prompt}>{choice.prompt ?? "Leader ability"}</Text>

      <Text style={styles.label}>
        {abilityId === "teach_redirect" ? "Trash a [Trigger] card" : "Trash a card"}
      </Text>
      <View style={styles.row}>
        {handOptions.length === 0 ? (
          <Text style={styles.meta}>No cards in hand — decline or wait</Text>
        ) : (
          handOptions.map(({ card, index, entry }) => (
            <Pressable
              key={card.id}
              onPress={() => setHandIndex(index)}
              style={[styles.chip, handIndex === index ? styles.chipSelected : null]}
            >
              <Text style={styles.chipText}>{entry.name}</Text>
            </Pressable>
          ))
        )}
      </View>

      {abilityId === "newgate_battle_power" ? (
        <>
          <Text style={styles.label}>Give +4000 power this battle</Text>
          <View style={styles.row}>
            {buffTargets.map((t) => (
              <Pressable
                key={t.id}
                onPress={() => setBuffTargetId(t.id)}
                style={[styles.chip, buffTargetId === t.id ? styles.chipSelected : null]}
              >
                <Text style={styles.chipText}>{t.label}</Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : null}

      {abilityId === "teach_redirect" ? (
        <>
          <Text style={styles.label}>New attack target (Leader or Blackbeard Pirates)</Text>
          <View style={styles.row}>
            <Pressable
              onPress={() => {
                setRetargetLeader(true);
                setRetargetCharId(null);
              }}
              style={[styles.chip, retargetLeader ? styles.chipSelected : null]}
            >
              <Text style={styles.chipText}>
                Leader · {lookupCard(view.you.leader.defId).name}
              </Text>
            </Pressable>
            {retargetChars.map(({ ch, entry }) => (
              <Pressable
                key={ch.id}
                onPress={() => {
                  setRetargetLeader(false);
                  setRetargetCharId(ch.id);
                }}
                style={[
                  styles.chip,
                  !retargetLeader && retargetCharId === ch.id ? styles.chipSelected : null,
                ]}
              >
                <Text style={styles.chipText}>{entry.name}</Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : null}

      {abilityId === "rocks_reveal_draw" ? (
        <Text style={styles.meta}>
          Confirm trashes the selected card, reveals the top of your deck, and draws 2 if it is a
          Rocks Pirates type card.
        </Text>
      ) : null}

      <View style={styles.actions}>
        <Pressable
          disabled={!canAccept}
          onPress={accept}
          style={[styles.btnPrimary, !canAccept ? styles.btnDisabled : null]}
        >
          <Text style={styles.btnText}>Confirm</Text>
        </Pressable>
        {choice.optional ? (
          <Pressable
            onPress={() => onSend({ type: "resolve_pending_choice", accept: false })}
            style={styles.btnSecondary}
          >
            <Text style={styles.btnText}>Decline</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: "#1a237e",
    borderRadius: 10,
    padding: 12,
    marginVertical: 10,
    gap: 8,
  },
  title: { color: "#fff", fontSize: 15, fontWeight: "800" },
  prompt: { color: "#e8eaf6", fontSize: 12, lineHeight: 17 },
  label: {
    color: "#90caf9",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    backgroundColor: "#283593",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#5c6bc0",
  },
  chipSelected: { backgroundColor: "#1565c0", borderColor: "#90caf9" },
  chipText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  meta: { color: "#b0bec5", fontSize: 11, lineHeight: 15 },
  actions: { flexDirection: "row", gap: 8, marginTop: 4 },
  btnPrimary: {
    backgroundColor: "#2e7d32",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
  },
  btnSecondary: {
    backgroundColor: "#455a64",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
  },
  btnDisabled: { opacity: 0.4 },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
});
