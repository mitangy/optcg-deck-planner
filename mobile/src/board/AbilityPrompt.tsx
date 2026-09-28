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
 * The atlas supplies printed metadata; the server validates submitted choices.
 */
export function AbilityPrompt({ view, choice, onSend }: Props) {
  const [handIndex, setHandIndex] = useState<number | null>(null);
  const [buffTargetId, setBuffTargetId] = useState<string | null>(null);
  const [retargetLeader, setRetargetLeader] = useState(true);
  const [retargetCharId, setRetargetCharId] = useState<string | null>(null);
  const [debuffTargetId, setDebuffTargetId] = useState<string | null>(null);
  const [copyPowerTargetId, setCopyPowerTargetId] = useState<string | null>(null);
  const [trashOptionId, setTrashOptionId] = useState<string | null>(null);
  const [handIndices, setHandIndices] = useState<number[]>([]);
  const [selectedDonIds, setSelectedDonIds] = useState<string[]>([]);
  const [targetIds, setTargetIds] = useState<string[]>([]);

  const abilityId = choice.abilityId;

  if (abilityId === "counter_friendly_power" || abilityId === "counter_opponent_target_power" || abilityId === "trigger_friendly_power") {
    const targets = abilityId === "counter_opponent_target_power" ? [view.opponent.leader, ...view.opponent.characters] : [view.you.leader, ...view.you.characters];
    return (
      <View style={styles.wrap} accessibilityRole="summary">
        <Text style={styles.title}>Choose a power-effect target</Text>
        <Text style={styles.prompt}>{choice.prompt}</Text>
        <View style={styles.row}>{targets.map((target) => <Pressable key={target.id} onPress={() => setBuffTargetId(target.id)} style={[styles.chip, buffTargetId === target.id ? styles.chipSelected : null]}><Text style={styles.chipText}>{lookupCard(target.defId).name}</Text></Pressable>)}</View>
        <View style={styles.actions}>
          <Pressable disabled={!buffTargetId} onPress={() => buffTargetId && onSend({ type: "resolve_pending_choice", accept: true, buffTargetId })} style={[styles.btnPrimary, !buffTargetId ? styles.btnDisabled : null]}><Text style={styles.btnText}>Confirm</Text></Pressable>
          <Pressable onPress={() => onSend({ type: "resolve_pending_choice", accept: false })} style={styles.btnSecondary}><Text style={styles.btnText}>Skip</Text></Pressable>
        </View>
      </View>
    );
  }

  if (abilityId === "on_play_add_active_don") {
    return (
      <View style={styles.wrap} accessibilityRole="summary">
        <Text style={styles.title}>Add an active DON!!</Text>
        <Text style={styles.prompt}>{choice.prompt}</Text>
        <View style={styles.actions}>
          <Pressable onPress={() => onSend({ type: "resolve_pending_choice", accept: true })} style={styles.btnPrimary}><Text style={styles.btnText}>Add DON!!</Text></Pressable>
          <Pressable onPress={() => onSend({ type: "resolve_pending_choice", accept: false })} style={styles.btnSecondary}><Text style={styles.btnText}>Skip</Text></Pressable>
        </View>
      </View>
    );
  }

  if (abilityId === "on_ko_set_base_power" || abilityId === "on_ko_ko_opponent_cost" || abilityId === "on_ko_rest_opponent_cost") {
    const maxTargets = choice.targetSelection?.maxTargets ?? 1;
    const maxCost = choice.targetSelection?.maxCost;
    const ownTargets = [view.you.leader, ...view.you.characters];
    const opponentTargets = view.opponent.characters.filter((character) => (maxCost == null || (character.fieldCost ?? lookupCard(character.defId).cost) <= maxCost) && (abilityId !== "on_ko_rest_opponent_cost" || !character.rested));
    const toggle = (id: string) => setTargetIds((current) => current.includes(id) ? current.filter((value) => value !== id) : current.length < maxTargets ? [...current, id] : current);
    return (
      <View style={styles.wrap} accessibilityRole="summary">
        <Text style={styles.title}>On K.O. — choose target</Text>
        <Text style={styles.prompt}>{choice.prompt}</Text>
        <View style={styles.row}>
          {abilityId === "on_ko_set_base_power" ? ownTargets.map((target) => <Pressable key={target.id} onPress={() => setBuffTargetId(target.id)} style={[styles.chip, buffTargetId === target.id ? styles.chipSelected : null]}><Text style={styles.chipText}>{lookupCard(target.defId).name}</Text></Pressable>) : opponentTargets.map((target) => <Pressable key={target.id} onPress={() => toggle(target.id)} style={[styles.chip, targetIds.includes(target.id) ? styles.chipSelected : null]}><Text style={styles.chipText}>{lookupCard(target.defId).name}</Text></Pressable>)}
        </View>
        <View style={styles.actions}>
          <Pressable disabled={abilityId === "on_ko_set_base_power" ? !buffTargetId : targetIds.length === 0} onPress={() => onSend(abilityId === "on_ko_set_base_power" ? { type: "resolve_pending_choice", accept: true, buffTargetId: buffTargetId! } : { type: "resolve_pending_choice", accept: true, targetIds })} style={[styles.btnPrimary, (abilityId === "on_ko_set_base_power" ? !buffTargetId : targetIds.length === 0) ? styles.btnDisabled : null]}><Text style={styles.btnText}>Confirm</Text></Pressable>
          <Pressable onPress={() => onSend({ type: "resolve_pending_choice", accept: false })} style={styles.btnSecondary}><Text style={styles.btnText}>Skip</Text></Pressable>
        </View>
      </View>
    );
  }

  if (abilityId === "marco_removal_replacement") {
    return (
      <View style={styles.wrap} accessibilityRole="summary">
        <Text style={styles.title}>Marco — removal replacement</Text>
        <Text style={styles.prompt}>{choice.prompt}</Text>
        <View style={styles.actions}>
          <Pressable onPress={() => onSend({ type: "resolve_pending_choice", accept: true })} style={styles.btnPrimary}><Text style={styles.btnText}>Use Marco</Text></Pressable>
          <Pressable onPress={() => onSend({ type: "resolve_pending_choice", accept: false })} style={styles.btnSecondary}><Text style={styles.btnText}>Decline</Text></Pressable>
        </View>
      </View>
    );
  }

  if (abilityId === "on_ko_return_don_add_life" || abilityId === "counter_rest_don_opponent_all") {
    const count = choice.donOptions?.length ? 1 : 0;
    const toggle = (id: string) => setSelectedDonIds((current) => current.includes(id) ? current.filter((value) => value !== id) : current.length < count ? [...current, id] : current);
    return (
      <View style={styles.wrap} accessibilityRole="summary">
        <Text style={styles.title}>{abilityId === "counter_rest_don_opponent_all" ? "Rest DON!!" : "On K.O. — return DON!!"}</Text>
        <Text style={styles.prompt}>{choice.prompt}</Text>
        <View style={styles.row}>
          {(choice.donOptions ?? []).map((don, index) => (
            <Pressable key={don.id} onPress={() => toggle(don.id)} style={[styles.chip, selectedDonIds.includes(don.id) ? styles.chipSelected : null]}><Text style={styles.chipText}>DON!! {index + 1} · {don.attachedTo ? "attached" : don.rested ? "rested" : "active"}</Text></Pressable>
          ))}
        </View>
        <View style={styles.actions}>
          <Pressable disabled={selectedDonIds.length !== count} onPress={() => onSend({ type: "resolve_pending_choice", accept: true, selectedDonIds })} style={[styles.btnPrimary, selectedDonIds.length !== count ? styles.btnDisabled : null]}><Text style={styles.btnText}>Confirm</Text></Pressable>
          <Pressable onPress={() => onSend({ type: "resolve_pending_choice", accept: false })} style={styles.btnSecondary}><Text style={styles.btnText}>Decline</Text></Pressable>
        </View>
      </View>
    );
  }

  if (abilityId === "on_ko_revive_self") {
    const candidates = view.you.hand
      .map((card, index) => ({ card, index, entry: lookupCard(card.defId) }))
      .filter(({ entry }) => (entry.traits ?? []).some((trait) => trait.includes("Whitebeard Pirates")));
    return (
      <View style={styles.wrap} accessibilityRole="summary">
        <Text style={styles.title}>On K.O. — revive Marco</Text>
        <Text style={styles.prompt}>{choice.prompt}</Text>
        <View style={styles.row}>{candidates.map(({ card, index, entry }) => <Pressable key={card.id} onPress={() => setHandIndex(index)} style={[styles.chip, handIndex === index ? styles.chipSelected : null]}><Text style={styles.chipText}>{entry.name}</Text></Pressable>)}</View>
        <View style={styles.actions}>
          <Pressable disabled={handIndex == null} onPress={() => handIndex != null && onSend({ type: "resolve_pending_choice", accept: true, handIndex })} style={[styles.btnPrimary, handIndex == null ? styles.btnDisabled : null]}><Text style={styles.btnText}>Confirm</Text></Pressable>
          <Pressable onPress={() => onSend({ type: "resolve_pending_choice", accept: false })} style={styles.btnSecondary}><Text style={styles.btnText}>Decline</Text></Pressable>
        </View>
      </View>
    );
  }

  if (abilityId === "main_trash_trigger_to_hand" || abilityId === "trigger_play_trash_character") {
    return (
      <View style={styles.wrap} accessibilityRole="summary">
        <Text style={styles.title}>{abilityId === "trigger_play_trash_character" ? "Play a Character from trash" : "Choose a Trigger card from trash"}</Text>
        <Text style={styles.prompt}>{choice.prompt}</Text>
        <View style={styles.row}>{(choice.trashOptions ?? []).filter((option) => option.eligible).map((option) => <Pressable key={option.id} onPress={() => setTrashOptionId(option.id)} style={[styles.chip, trashOptionId === option.id ? styles.chipSelected : null]}><Text style={styles.chipText}>{lookupCard(option.defId).name}</Text></Pressable>)}</View>
        <View style={styles.actions}>
          <Pressable disabled={!trashOptionId} onPress={() => trashOptionId && onSend({ type: "resolve_pending_choice", accept: true, selectedTrashOptionId: trashOptionId })} style={[styles.btnPrimary, !trashOptionId ? styles.btnDisabled : null]}><Text style={styles.btnText}>Confirm</Text></Pressable>
          <Pressable onPress={() => onSend({ type: "resolve_pending_choice", accept: false })} style={styles.btnSecondary}><Text style={styles.btnText}>Skip</Text></Pressable>
        </View>
      </View>
    );
  }

  if (
    abilityId === "trigger_negate_opponent_card" ||
    abilityId === "trigger_ko_opponent_cost" ||
    abilityId === "teach_negate_leader" ||
    abilityId === "teach_negate_character"
  ) {
    const charactersOnly =
      abilityId === "trigger_ko_opponent_cost" ||
      abilityId === "teach_negate_character" ||
      (abilityId === "trigger_negate_opponent_card" && choice.cardDefId === "OP16-119");
    return (
      <View style={styles.wrap} accessibilityRole="summary">
        <Text style={styles.title}>
          {abilityId === "trigger_ko_opponent_cost" ? "K.O. an opponent Character" : "Negate an opponent card"}
        </Text>
        <Text style={styles.prompt}>{choice.prompt}</Text>
        <View style={styles.row}>
          {!charactersOnly ? (
            <Pressable onPress={() => setBuffTargetId(view.opponent.leader.id)} style={[styles.chip, buffTargetId === view.opponent.leader.id ? styles.chipSelected : null]}>
              <Text style={styles.chipText}>Leader · {lookupCard(view.opponent.leader.defId).name}</Text>
            </Pressable>
          ) : null}
          {abilityId !== "teach_negate_leader" ? view.opponent.characters.map((character) => (
            <Pressable key={character.id} onPress={() => setBuffTargetId(character.id)} style={[styles.chip, buffTargetId === character.id ? styles.chipSelected : null]}>
              <Text style={styles.chipText}>{lookupCard(character.defId).name}</Text>
            </Pressable>
          )) : null}
        </View>
        <View style={styles.actions}>
          <Pressable disabled={buffTargetId == null} onPress={() => buffTargetId && onSend({ type: "resolve_pending_choice", accept: true, buffTargetId })} style={[styles.btnPrimary, buffTargetId == null ? styles.btnDisabled : null]}>
            <Text style={styles.btnText}>Confirm</Text>
          </Pressable>
          {choice.optional ? <Pressable onPress={() => onSend({ type: "resolve_pending_choice", accept: false })} style={styles.btnSecondary}><Text style={styles.btnText}>Skip</Text></Pressable> : null}
        </View>
      </View>
    );
  }

  if (abilityId === "main_play_named_character") {
    const candidates = view.you.hand
      .map((card, index) => ({ card, index, entry: lookupCard(card.defId) }))
      .filter(({ entry }) => entry.type === "character" && entry.name === "Marshall.D.Teach");
    return (
      <View style={styles.wrap} accessibilityRole="summary">
        <Text style={styles.title}>Play Marshall.D.Teach</Text>
        <Text style={styles.prompt}>{choice.prompt}</Text>
        <View style={styles.row}>
          {candidates.map(({ card, index, entry }) => (
            <Pressable key={card.id} onPress={() => setHandIndex(index)} style={[styles.chip, handIndex === index ? styles.chipSelected : null]}>
              <Text style={styles.chipText}>{entry.name}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.actions}>
          <Pressable disabled={handIndex == null} onPress={() => handIndex != null && onSend({ type: "resolve_pending_choice", accept: true, handIndex })} style={[styles.btnPrimary, handIndex == null ? styles.btnDisabled : null]}>
            <Text style={styles.btnText}>Confirm</Text>
          </Pressable>
          <Pressable onPress={() => onSend({ type: "resolve_pending_choice", accept: false })} style={styles.btnSecondary}>
            <Text style={styles.btnText}>Skip</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (abilityId === "on_play_reveal_draw_trash" || abilityId === "discard_hand_count") {
    const count = choice.handSelection?.count ?? 0;
    const qualifyingPower = choice.handSelection?.qualifyingPower;
    const toggle = (index: number) => {
      setHandIndices((current) =>
        current.includes(index)
          ? current.filter((value) => value !== index)
          : current.length < count
            ? [...current, index]
            : current,
      );
    };
    return (
      <View style={styles.wrap} accessibilityRole="summary">
        <Text style={styles.title}>
          {abilityId === "discard_hand_count" ? "Trash cards" : "Reveal cards"}
        </Text>
        <Text style={styles.prompt}>{choice.prompt}</Text>
        <Text style={styles.label}>Choose exactly {count}</Text>
        <View style={styles.row}>
          {view.you.hand.map((card, index) => {
            const entry = lookupCard(card.defId);
            const eligible =
              qualifyingPower == null ||
              (entry.type === "character" && entry.power === qualifyingPower);
            return (
              <Pressable
                key={card.id}
                disabled={!eligible}
                onPress={() => toggle(index)}
                style={[
                  styles.chip,
                  handIndices.includes(index) ? styles.chipSelected : null,
                  !eligible ? styles.btnDisabled : null,
                ]}
              >
                <Text style={styles.chipText}>{entry.name}</Text>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.actions}>
          <Pressable
            disabled={handIndices.length !== count}
            onPress={() =>
              onSend({ type: "resolve_pending_choice", accept: true, handIndices })
            }
            style={[
              styles.btnPrimary,
              handIndices.length !== count ? styles.btnDisabled : null,
            ]}
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

  if (abilityId === "on_play_power_debuff" || abilityId === "on_play_ko_power") {
    return (
      <View style={styles.wrap} accessibilityRole="summary">
        <Text style={styles.title}>On Play</Text>
        <Text style={styles.prompt}>{choice.prompt}</Text>
        <Text style={styles.label}>{abilityId === "on_play_ko_power" ? "Choose an opponent Character to K.O." : "Choose a rested opponent Character"}</Text>
        <View style={styles.row}>
          {view.opponent.characters.map((character) => (
            <Pressable
              key={character.id}
              disabled={abilityId === "on_play_power_debuff" ? !character.rested : (character.power ?? 0) > 7000}
              onPress={() => setDebuffTargetId(character.id)}
              style={[styles.chip, debuffTargetId === character.id ? styles.chipSelected : null]}
            >
              <Text style={styles.chipText}>{lookupCard(character.defId).name}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.actions}>
          <Pressable
            disabled={!debuffTargetId}
            onPress={() => debuffTargetId && onSend({ type: "resolve_pending_choice", accept: true, buffTargetId: debuffTargetId })}
            style={[styles.btnPrimary, !debuffTargetId ? styles.btnDisabled : null]}
          >
            <Text style={styles.btnText}>Confirm</Text>
          </Pressable>
          {choice.optional ? (
            <Pressable onPress={() => onSend({ type: "resolve_pending_choice", accept: false })} style={styles.btnSecondary}>
              <Text style={styles.btnText}>Decline</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    );
  }

  if (abilityId === "on_play_trash_hand_to_life") {
    return (
      <View style={styles.wrap} accessibilityRole="summary">
        <Text style={styles.title}>On Play — move a card to Life</Text>
        <Text style={styles.prompt}>{choice.prompt}</Text>
        <Text style={styles.label}>Trash 1 card from hand</Text>
        <View style={styles.row}>
          {view.you.hand.map((entry, index) => (
            <Pressable key={entry.id} onPress={() => setHandIndex(index)} style={[styles.chip, handIndex === index ? styles.chipSelected : null]}>
              <Text style={styles.chipText}>{lookupCard(entry.defId).name}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.label}>Choose a card from trash</Text>
        <View style={styles.row}>
          {(choice.trashOptions ?? []).filter((option) => option.eligible).map((option) => (
            <Pressable key={option.id} onPress={() => setTrashOptionId(option.id)} style={[styles.chip, trashOptionId === option.id ? styles.chipSelected : null]}>
              <Text style={styles.chipText}>{lookupCard(option.defId).name}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.actions}>
          <Pressable disabled={handIndex == null || trashOptionId == null} onPress={() => handIndex != null && trashOptionId && onSend({ type: "resolve_pending_choice", accept: true, handIndex, selectedTrashOptionId: trashOptionId })} style={[styles.btnPrimary, handIndex == null || trashOptionId == null ? styles.btnDisabled : null]}>
            <Text style={styles.btnText}>Confirm</Text>
          </Pressable>
          {choice.optional ? <Pressable onPress={() => onSend({ type: "resolve_pending_choice", accept: false })} style={styles.btnSecondary}><Text style={styles.btnText}>Decline</Text></Pressable> : null}
        </View>
      </View>
    );
  }

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
      ...view.you.characters
        .filter((ch) => abilityId !== "jinbe_attack_power" || ch.id !== choice.sourceInstanceId)
        .map((ch) => ({
          id: ch.id,
          label: lookupCard(ch.defId).name,
        })),
    ],
    [view.you.leader, view.you.characters, abilityId, choice.sourceInstanceId],
  );

  const retargetChars = useMemo(() => {
    return view.you.characters.map((ch) => ({
      ch,
      entry: lookupCard(ch.defId),
    }));
  }, [view.you.characters]);

  const canAccept =
    abilityId === "jinbe_attack_power" ||
    (abilityId === "copy_opponent_power" && copyPowerTargetId != null) ||
    (handIndex != null &&
    (abilityId === "newgate_battle_power"
      ? buffTargetId != null
      : abilityId === "teach_redirect"
        ? retargetLeader || retargetCharId != null
        : abilityId === "rocks_reveal_draw"
          ? true
          : false));

  function accept() {
    if (!canAccept) return;
    if (abilityId === "jinbe_attack_power") {
      onSend({
        type: "resolve_pending_choice",
        accept: true,
        buffTargetId: buffTargetId ?? undefined,
      });
      return;
    }
    if (abilityId === "copy_opponent_power") {
      onSend({ type: "resolve_pending_choice", accept: true, copyPowerTargetId: copyPowerTargetId! });
      return;
    }
    if (handIndex == null) return;
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
          : abilityId === "jinbe_attack_power"
            ? "Jinbe — power boost"
            : abilityId === "copy_opponent_power"
              ? "Devon — copy power"
            : "Ability";

  return (
    <View style={styles.wrap} accessibilityRole="summary">
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.prompt}>{choice.prompt ?? "Leader ability"}</Text>

      {abilityId !== "jinbe_attack_power" && abilityId !== "copy_opponent_power" ? <><Text style={styles.label}>
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
      </View></> : null}

      {abilityId === "newgate_battle_power" || abilityId === "jinbe_attack_power" ? (
        <>
          <Text style={styles.label}>
            {abilityId === "jinbe_attack_power"
              ? "Give +1000 power this turn (none allowed)"
              : "Give +4000 power this battle"}
          </Text>
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

      {abilityId === "copy_opponent_power" ? (
        <>
          <Text style={styles.label}>Opponent Character to copy</Text>
          <View style={styles.row}>
            {view.opponent.characters.map((character) => (
              <Pressable
                key={character.id}
                onPress={() => setCopyPowerTargetId(character.id)}
                style={[styles.chip, copyPowerTargetId === character.id ? styles.chipSelected : null]}
              >
                <Text style={styles.chipText}>{lookupCard(character.defId).name}</Text>
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
