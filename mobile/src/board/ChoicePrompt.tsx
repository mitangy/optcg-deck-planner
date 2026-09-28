import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { lookupCard } from "../cards/atlas";
import type { ChoiceOptionView, ChoiceRequestView, Intent, PendingChoiceView, Seat } from "../net/protocol";
import { CardTile } from "./CardTile";

type Props = {
  choice: PendingChoiceView;
  mySeat: Seat;
  onSend: (intent: Intent) => void;
};

function optionName(option: ChoiceOptionView): string {
  if (option.label) return option.label;
  if (!option.defId || option.defId === "HIDDEN") return "Hidden card";
  return lookupCard(option.defId).name;
}

function OptionTile({ option, mySeat, selected, disabled, onToggle }: { option: ChoiceOptionView; mySeat: Seat; selected: boolean; disabled: boolean; onToggle: () => void }) {
  const owner = option.ownerSeat == null ? "" : option.ownerSeat === mySeat ? "Yours" : "Opponent";
  if (!option.defId || option.defId === "HIDDEN") {
    return (
      <Pressable disabled={disabled} onPress={onToggle} style={[styles.chip, selected ? styles.chipSelected : null, disabled ? styles.disabled : null]} accessibilityState={{ selected, disabled }}>
        <Text style={styles.chipText}>{optionName(option)}</Text>
      </Pressable>
    );
  }
  return (
    <View style={[styles.option, disabled ? styles.disabled : null]}>
      <CardTile defId={option.defId} compact rested={option.rested} selected={selected} onPress={disabled ? undefined : onToggle} />
      <Text style={styles.caption} numberOfLines={2}>{[optionName(option), owner].filter(Boolean).join(" · ")}</Text>
    </View>
  );
}

function move(list: string[], id: string, delta: -1 | 1): string[] {
  const index = list.indexOf(id);
  const next = index + delta;
  if (index < 0 || next < 0 || next >= list.length) return list;
  const out = [...list];
  [out[index], out[next]] = [out[next]!, out[index]!];
  return out;
}

function OrderRows({ ids, byId, onMove, topIds, onToggleTop, topBottom }: { ids: string[]; byId: Map<string, ChoiceOptionView>; onMove: (id: string, d: -1 | 1) => void; topIds: Set<string>; onToggleTop: (id: string) => void; topBottom: boolean }) {
  return (
    <>
      {ids.map((id, index) => (
        <View key={id} style={styles.orderRow}>
          <Text style={styles.chipText} numberOfLines={1}>{optionName(byId.get(id)!)}</Text>
          <View style={styles.row}>
            {topBottom ? (
              <Pressable onPress={() => onToggleTop(id)} style={styles.arrow}>
                <Text style={styles.buttonText}>{topIds.has(id) ? "Top" : "Bottom"}</Text>
              </Pressable>
            ) : null}
            <Pressable disabled={index === 0} onPress={() => onMove(id, -1)} style={styles.arrow}><Text style={styles.buttonText}>↑</Text></Pressable>
            <Pressable disabled={index === ids.length - 1} onPress={() => onMove(id, 1)} style={styles.arrow}><Text style={styles.buttonText}>↓</Text></Pressable>
          </View>
        </View>
      ))}
    </>
  );
}

function toggleSet(set: Set<string>, id: string): Set<string> {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/** Generic prompt for every server choice request (protocol 5). */
export function ChoicePrompt({ choice, mySeat, onSend }: Props) {
  const request: ChoiceRequestView = choice.request ?? { type: "confirm" };
  const options = "options" in request ? request.options : [];
  const byId = useMemo(() => new Map(options.map((o) => [o.id, o])), [options]);
  const [selected, setSelected] = useState<string[]>([]);
  const [order, setOrder] = useState<string[]>(() => options.map((o) => o.id));
  const [topIds, setTopIds] = useState<Set<string>>(() => new Set(request.type === "order" ? options.map((o) => o.id) : []));
  const title = choice.cardDefId && choice.cardDefId !== "HIDDEN" ? lookupCard(choice.cardDefId).name : "Effect";
  const maxPick = request.type === "select" ? request.max : request.type === "look" ? request.maxSelect : 0;
  const toggle = (id: string) => setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : maxPick === 1 ? [id] : cur.length >= maxPick ? cur : [...cur, id]));
  const send = (intent: Intent) => onSend(intent);

  return (
    <View style={styles.wrap} accessibilityRole="summary">
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.prompt}>{choice.prompt}</Text>
      {request.type === "confirm" ? (
        <View style={styles.row}>
          <Pressable onPress={() => send({ type: "resolve_pending_choice", accept: true })} style={styles.primary}>
            <Text style={styles.buttonText}>{choice.kind === "life_trigger" ? "Activate Trigger" : "Yes"}</Text>
          </Pressable>
          {choice.optional ? (
            <Pressable onPress={() => send({ type: "resolve_pending_choice", accept: false })} style={styles.secondary}>
              <Text style={styles.buttonText}>{choice.kind === "life_trigger" ? "Add to hand" : "No"}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {request.type === "mode" ? (
        <View style={{ gap: 8 }}>
          {request.options.map((option) => (
            <Pressable key={option.id} onPress={() => send({ type: "resolve_pending_choice", accept: true, selectedOptionIds: [option.id] })} style={styles.secondary}>
              <Text style={styles.buttonText}>{option.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {request.type === "select" ? (
        <>
          <Text style={styles.label}>
            Choose {request.min === request.max ? request.max : request.min === 0 ? `up to ${request.max}` : `${request.min}–${request.max}`} · selected {selected.length}
          </Text>
          <View style={styles.row}>
            {request.options.map((option) => (
              <OptionTile key={option.id} option={option} mySeat={mySeat} selected={selected.includes(option.id)} disabled={!option.eligible} onToggle={() => toggle(option.id)} />
            ))}
          </View>
          <Pressable
            disabled={selected.length < request.min || selected.length > request.max}
            onPress={() => send({ type: "resolve_pending_choice", accept: true, selectedOptionIds: selected })}
            style={[styles.primary, selected.length < request.min ? styles.disabled : null]}
          >
            <Text style={styles.buttonText}>{selected.length ? `Confirm (${selected.length})` : "Choose none"}</Text>
          </Pressable>
        </>
      ) : null}
      {request.type === "look" ? (
        <>
          <Text style={styles.label}>{request.groups.map((g) => g.label).join(" · ") || "Look"} · selected {selected.length}</Text>
          <View style={styles.row}>
            {request.options.map((option) => (
              <OptionTile
                key={option.id}
                option={option}
                mySeat={mySeat}
                selected={selected.includes(option.id)}
                disabled={request.maxSelect === 0 || !request.groups.some((g) => g.eligibleIds.includes(option.id))}
                onToggle={() => toggle(option.id)}
              />
            ))}
          </View>
          {request.rest === "deck_bottom" || request.rest === "deck_top" || request.rest === "top_or_bottom" ? (
            <>
              <Text style={styles.label}>{request.restLabel}</Text>
              <OrderRows
                ids={order.filter((id) => !selected.includes(id))}
                byId={byId}
                onMove={(id, d) => setOrder((cur) => move(cur, id, d))}
                topIds={topIds}
                onToggleTop={(id) => setTopIds((cur) => toggleSet(cur, id))}
                topBottom={request.rest === "top_or_bottom"}
              />
            </>
          ) : (
            <Text style={styles.label}>{request.restLabel}</Text>
          )}
          <Pressable
            onPress={() => {
              const remaining = order.filter((id) => !selected.includes(id));
              send({ type: "resolve_pending_choice", accept: true, selectedOptionIds: selected, orderedOptionIds: remaining, ...(request.rest === "top_or_bottom" ? { topOptionIds: remaining.filter((id) => topIds.has(id)) } : {}) });
            }}
            style={styles.primary}
          >
            <Text style={styles.buttonText}>{selected.length ? "Confirm" : request.maxSelect ? "Take none & finish" : "Done"}</Text>
          </Pressable>
        </>
      ) : null}
      {request.type === "order" ? (
        <>
          <OrderRows ids={order} byId={byId} onMove={(id, d) => setOrder((cur) => move(cur, id, d))} topIds={topIds} onToggleTop={(id) => setTopIds((cur) => toggleSet(cur, id))} topBottom={Boolean(request.allowTopOrBottom)} />
          <Pressable onPress={() => send({ type: "resolve_pending_choice", accept: true, orderedOptionIds: order, ...(request.allowTopOrBottom ? { topOptionIds: order.filter((id) => topIds.has(id)) } : {}) })} style={styles.primary}>
            <Text style={styles.buttonText}>Confirm order</Text>
          </Pressable>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: "#1a237e", borderRadius: 10, padding: 12, marginVertical: 10, gap: 8 },
  title: { color: "#fff", fontSize: 15, fontWeight: "800" },
  prompt: { color: "#e8eaf6", fontSize: 12, lineHeight: 17 },
  label: { color: "#90caf9", fontSize: 11, fontWeight: "700", textTransform: "uppercase" },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  option: { width: 72, alignItems: "center", gap: 4 },
  caption: { color: "#c5cae9", fontSize: 10, textAlign: "center" },
  chip: { backgroundColor: "#283593", paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: "#3949ab" },
  chipSelected: { borderColor: "#ffca28", backgroundColor: "#303f9f" },
  chipText: { color: "#fff", fontSize: 12, flexShrink: 1 },
  orderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  arrow: { backgroundColor: "#37474f", borderRadius: 6, paddingHorizontal: 12, paddingVertical: 7 },
  primary: { alignSelf: "flex-start", backgroundColor: "#00897b", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9 },
  secondary: { backgroundColor: "#455a64", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9 },
  buttonText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  disabled: { opacity: 0.45 },
});
