import React, { useMemo, useRef, useState, type ReactNode } from "react";
import { Animated, PanResponder, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { lookupCard } from "../cards/atlas";
import type { ChoiceRequestView, Intent, PendingChoiceView } from "../net/protocol";
import { CardTile } from "./CardTile";
import { floatCardSize, floatLookAnswer, moveId, nearestSlot, tapInOrder } from "./floatOrder";

/**
 * Floating-card prompts (mirrors duel-web's FloatingPrompt): instead of a panel
 * in the scroll view, the cards an effect works with float over a dimmed board.
 * Tap a card to pick it, drag cards (or use ◀ ▶) to reorder, then confirm. The
 * row reads left → right: top of deck → bottom, or first effect → last.
 */

/** Pending choices that can float; everything else keeps the inline prompt. */
export function canFloat(choice: PendingChoiceView): boolean {
  if (choice.kind === "order_effects") return (choice.unorderedChoices?.length ?? 0) > 1;
  const request = choice.request;
  return request?.type === "look" && request.options.every((o) => o.defId && o.defId !== "HIDDEN" && o.zone !== "don");
}

const DRAG_START_PX = 10;
const GAP = 8;

type Slots = Map<string, { x: number; y: number }>;

/**
 * One card in the row. A press is a tap; moving past a few px turns it into a
 * drag: the card follows the finger and the row reorders live under it.
 */
function FloatCard({ id, slots, onReorder, width, children, below, lifted, dimmed }: {
  id: string;
  slots: React.MutableRefObject<Slots>;
  onReorder: (id: string, x: number, y: number) => void;
  width: number;
  children: ReactNode;
  below: ReactNode;
  lifted?: boolean;
  dimmed?: boolean;
}) {
  const pan = useRef(new Animated.ValueXY()).current;
  const [dragging, setDragging] = useState(false);
  const start = useRef({ x: 0, y: 0 });
  const live = useRef({ onReorder });
  live.current = { onReorder };
  const responder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > DRAG_START_PX || Math.abs(g.dy) > DRAG_START_PX,
        onMoveShouldSetPanResponderCapture: (_, g) => Math.abs(g.dx) > DRAG_START_PX || Math.abs(g.dy) > DRAG_START_PX,
        // A drag that has started keeps the card; a scroll view behind can't steal it.
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          start.current = slots.current.get(id) ?? { x: 0, y: 0 };
          setDragging(true);
        },
        onPanResponderMove: (_, g) => {
          const x = start.current.x + g.dx;
          const y = start.current.y + g.dy;
          live.current.onReorder(id, x, y);
          // Follow the finger from wherever this card's slot is now.
          const slot = slots.current.get(id) ?? start.current;
          pan.setValue({ x: x - slot.x, y: y - slot.y });
        },
        onPanResponderRelease: () => {
          setDragging(false);
          Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false, speed: 30, bounciness: 4 }).start();
        },
        onPanResponderTerminate: () => {
          setDragging(false);
          pan.setValue({ x: 0, y: 0 });
        },
      }),
    [id, pan, slots],
  );
  return (
    <Animated.View
      {...responder.panHandlers}
      testID="float-card"
      onLayout={(e) => {
        const { x, y, width: w, height: h } = e.nativeEvent.layout;
        slots.current.set(id, { x: x + w / 2, y: y + h / 2 });
      }}
      style={[
        styles.card,
        Platform.OS === "web" ? ({ userSelect: "none", cursor: dragging ? "grabbing" : "grab" } as object) : null,
        { width, zIndex: dragging ? 3 : 1, transform: [...pan.getTranslateTransform(), { scale: dragging ? 1.06 : 1 }] },
      ]}
    >
      <View style={lifted ? styles.lifted : null}>
        {children}
        {/* A shade, not opacity: the board must not show through the card. */}
        {dimmed ? <View pointerEvents="none" style={styles.dimmed} /> : null}
      </View>
      {below}
    </Animated.View>
  );
}

/** Live drag reorder for a row: the dragged card takes the slot nearest the finger. */
function useRowReorder(order: string[], setOrder: (next: string[]) => void) {
  const slots = useRef<Slots>(new Map());
  const live = useRef({ order, setOrder });
  live.current = { order, setOrder };
  const onReorder = (id: string, x: number, y: number) => {
    const cur = live.current.order;
    const centers = cur.map((c) => slots.current.get(c) ?? { x: 0, y: 0 });
    const index = nearestSlot(centers, x, y);
    if (cur.indexOf(id) !== index) live.current.setOrder(moveId(cur, id, index));
  };
  return { slots, onReorder };
}

function Shell({ title, prompt, count, peek, onPeek, axis, note, actions, children }: {
  title: string;
  prompt: string;
  count: number;
  peek: boolean;
  onPeek: (peek: boolean) => void;
  axis: [string, string] | null;
  note?: string;
  actions: ReactNode;
  /** Gets the card width that fits the overlay's own box (the board area, not the whole window). */
  children: (cardW: number) => ReactNode;
}) {
  const win = useWindowDimensions();
  const [box, setBox] = useState<{ width: number; height: number } | null>(null);
  const { width, height } = box ?? win;
  const landscape = width > height;
  const { cardW } = floatCardSize(count, width, height);
  if (peek) {
    return (
      <View style={styles.peekLayer} pointerEvents="box-none">
        <Pressable style={styles.returnPill} onPress={() => onPeek(false)} accessibilityRole="button">
          <Text style={styles.returnText}>
            Back to {title} · {count} card{count === 1 ? "" : "s"}
          </Text>
        </Pressable>
      </View>
    );
  }
  return (
    <View
      style={styles.layer}
      accessibilityViewIsModal
      accessibilityLabel={prompt}
      onLayout={(e) => setBox({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
    >
      <View style={[styles.stage, landscape ? styles.stageTight : null]}>
        {landscape ? (
          <Text style={styles.prompt} numberOfLines={1}>
            <Text style={styles.titleInline}>{title} · </Text>
            {prompt}
          </Text>
        ) : (
          <>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.prompt} numberOfLines={3}>{prompt}</Text>
          </>
        )}
        {children(cardW)}
        {axis ? (
          <View style={styles.axis}>
            <Text style={styles.axisText}>{axis[0]}</Text>
            <View style={styles.axisLine} />
            <Text style={styles.axisText}>{axis[1]} ▸</Text>
          </View>
        ) : null}
        {note && !landscape ? <Text style={styles.note}>{note}</Text> : null}
        <View style={styles.actions}>
          <Pressable style={styles.secondary} onPress={() => onPeek(true)} accessibilityRole="button">
            <Text style={styles.buttonText}>See board</Text>
          </Pressable>
          {actions}
        </View>
      </View>
    </View>
  );
}

function Nudge({ name, index, count, onMove, narrow }: { name: string; index: number; count: number; onMove: (to: number) => void; narrow: boolean }) {
  // Too narrow for both arrows under a small card: the slot number is enough (drag still works).
  if (narrow) {
    return (
      <View style={styles.nudge}>
        <Text style={styles.slot}>{index + 1}</Text>
      </View>
    );
  }
  return (
    <View style={styles.nudge}>
      <Pressable disabled={index === 0} onPress={() => onMove(index - 1)} style={[styles.nudgeBtn, index === 0 ? styles.off : null]} accessibilityLabel={`Move ${name} left`}>
        <Text style={styles.nudgeText}>◀</Text>
      </Pressable>
      <Text style={styles.slot}>{index + 1}</Text>
      <Pressable disabled={index === count - 1} onPress={() => onMove(index + 1)} style={[styles.nudgeBtn, index === count - 1 ? styles.off : null]} accessibilityLabel={`Move ${name} right`}>
        <Text style={styles.nudgeText}>▶</Text>
      </Pressable>
    </View>
  );
}

function sourceName(choice: PendingChoiceView): string {
  return choice.cardDefId && choice.cardDefId !== "HIDDEN" ? lookupCard(choice.cardDefId).name : "Effect";
}

/** Search / look at the top N cards: tap to take, drag to set the put-back order. */
function FloatLook({ choice, request, onSend }: { choice: PendingChoiceView; request: Extract<ChoiceRequestView, { type: "look" }>; onSend: (i: Intent) => void }) {
  const byId = useMemo(() => new Map(request.options.map((o) => [o.id, o])), [request.options]);
  const [row, setRow] = useState<string[]>(() => request.options.map((o) => o.id));
  const [picked, setPicked] = useState<string[]>([]);
  // "Top or bottom" moves the rest together: one switch for all of them.
  const [side, setSide] = useState<"top" | "bottom">("top");
  const [peek, setPeek] = useState(false);
  const { slots, onReorder } = useRowReorder(row, setRow);

  const eligible = (id: string) => request.maxSelect > 0 && request.groups.some((g) => g.eligibleIds.includes(id));
  const toggle = (id: string) =>
    setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : request.maxSelect === 1 ? [id] : cur.length >= request.maxSelect ? cur : [...cur, id]));
  const remaining = row.filter((id) => !picked.includes(id));
  const needsOrder = request.rest === "deck_bottom" || request.rest === "deck_top" || request.rest === "top_or_bottom";
  const onTop = request.rest === "deck_top" || (request.rest === "top_or_bottom" && side === "top");
  const name = (id: string) => lookupCard(byId.get(id)!.defId!).name;
  const note = [
    picked.length ? `Taking ${picked.map(name).join(", ")}.` : request.maxSelect > 0 ? "Tap a glowing card to take it." : "",
    needsOrder ? (remaining.length > 1 ? "Drag to reorder what goes back." : "") : request.restLabel,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Shell
      title={sourceName(choice)}
      prompt={choice.prompt ?? ""}
      count={row.length}
      peek={peek}
      onPeek={setPeek}
      axis={needsOrder ? (onTop ? ["Top of deck", "then the rest"] : ["Under the rest", "Very bottom"]) : null}
      note={note}
      actions={
        <>
          {request.rest === "top_or_bottom" && remaining.length ? (
            <View style={styles.seg} accessibilityLabel="Top or bottom of deck">
              {(["top", "bottom"] as const).map((s) => (
                <Pressable key={s} onPress={() => setSide(s)} style={[styles.segBtn, side === s ? styles.segOn : null]} accessibilityState={{ selected: side === s }}>
                  <Text style={[styles.buttonText, side === s ? styles.segOnText : null]}>{s === "top" ? "Top" : "Bottom"}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          <Pressable
            disabled={picked.length < request.minSelect}
            style={[styles.primary, picked.length < request.minSelect ? styles.off : null]}
            onPress={() => onSend({ type: "resolve_pending_choice", accept: true, ...floatLookAnswer(request, row, picked, side) })}
            accessibilityRole="button"
          >
            <Text style={styles.primaryText}>{request.maxSelect === 0 ? "Done" : picked.length ? `Confirm · take ${picked.length}` : "Take none & finish"}</Text>
          </Pressable>
        </>
      }
    >
      {(cardW) => (
      <View style={styles.row}>
        {row.map((id) => {
          const option = byId.get(id)!;
          const isPicked = picked.includes(id);
          const canTake = eligible(id);
          const slot = remaining.indexOf(id);
          return (
            <FloatCard
              key={id}
              id={id}
              slots={slots}
              onReorder={onReorder}
              width={cardW}
              lifted={isPicked}
              dimmed={request.maxSelect > 0 && !canTake}
              below={
                needsOrder && !isPicked && remaining.length > 1 ? (
                  <Nudge name={name(id)} index={slot} count={remaining.length} narrow={cardW < 84} onMove={(to) => setRow(moveId(row, id, row.indexOf(remaining[to]!)))} />
                ) : (
                  <View style={styles.nudge} />
                )
              }
            >
              <CardTile
                defId={option.defId!}
                selected={isPicked || canTake}
                onPress={canTake ? () => toggle(id) : undefined}
                style={[{ width: cardW, height: cardW / 0.716 }, isPicked ? styles.pickedTile : null]}
              />
              {isPicked ? (
                <View style={styles.badge} pointerEvents="none">
                  <Text style={styles.badgeText}>Take</Text>
                </View>
              ) : null}
            </FloatCard>
          );
        })}
      </View>
      )}
    </Shell>
  );
}

/** Several effects at once: tap them in the order to resolve, or drag left → right. */
function FloatEffectOrder({ choice, onSend }: { choice: PendingChoiceView; onSend: (i: Intent) => void }) {
  const effects = choice.unorderedChoices ?? [];
  const byId = useMemo(() => new Map(effects.map((c) => [c.id, c])), [effects]);
  const [order, setOrder] = useState<string[]>(() => effects.map((c) => c.id));
  const [tapped, setTapped] = useState<string[]>([]);
  const [peek, setPeek] = useState(false);
  const { slots, onReorder } = useRowReorder(order, (next) => {
    setOrder(next);
    setTapped([]);
  });
  return (
    <Shell
      title="Order effects"
      prompt={choice.prompt || "Choose the order these effects resolve in."}
      count={order.length}
      peek={peek}
      onPeek={setPeek}
      axis={["Resolves first", "Resolves last"]}
      note="Tap the cards in the order to resolve them, or drag them."
      actions={
        <>
          {tapped.length ? (
            <Pressable style={styles.secondary} onPress={() => setTapped([])} accessibilityRole="button">
              <Text style={styles.buttonText}>Reset</Text>
            </Pressable>
          ) : null}
          <Pressable style={styles.primary} onPress={() => onSend({ type: "order_pending_effects", orderedIds: order })} accessibilityRole="button">
            <Text style={styles.primaryText}>Resolve in this order</Text>
          </Pressable>
        </>
      }
    >
      {(cardW) => (
      <View style={styles.row}>
        {order.map((id, index) => {
          const effect = byId.get(id)!;
          const number = tapped.indexOf(id);
          return (
            <FloatCard
              key={id}
              id={id}
              slots={slots}
              onReorder={onReorder}
              width={cardW}
              below={
                <Text style={styles.effectText} numberOfLines={2}>
                  {effect.prompt ?? ""}
                </Text>
              }
            >
              <CardTile
                defId={effect.cardDefId}
                selected={number >= 0}
                onPress={() => {
                  const next = tapInOrder(order, tapped, id);
                  setOrder(next.order);
                  setTapped(next.tapped);
                }}
                style={{ width: cardW, height: cardW / 0.716 }}
              />
              <View style={[styles.num, number >= 0 ? null : styles.numAuto]} pointerEvents="none">
                <Text style={[styles.numText, number >= 0 ? null : styles.numAutoText]}>{number >= 0 ? number + 1 : index + 1}</Text>
              </View>
            </FloatCard>
          );
        })}
      </View>
      )}
    </Shell>
  );
}

/** Floating version of the choice prompt for the pending choices `canFloat` accepts. */
export function FloatingPrompt({ choice, onSend }: { choice: PendingChoiceView; onSend: (i: Intent) => void }) {
  if (choice.kind === "order_effects") return <FloatEffectOrder choice={choice} onSend={onSend} />;
  if (choice.request?.type === "look") return <FloatLook choice={choice} request={choice.request} onSend={onSend} />;
  return null;
}

const GOLD = "#f0dca8";

const styles = StyleSheet.create({
  layer: {
    position: "absolute", top: 0, right: 0, bottom: 0, left: 0,
    zIndex: 20,
    backgroundColor: "rgba(5, 11, 16, 0.86)",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  peekLayer: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, zIndex: 20, alignItems: "center", paddingTop: 12 },
  returnPill: {
    backgroundColor: "rgba(23, 42, 56, 0.96)",
    borderColor: "#d2a54d",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  returnText: { color: GOLD, fontWeight: "800", fontSize: 14 },
  stage: { alignItems: "center", gap: 8 },
  stageTight: { gap: 4 },
  titleInline: { color: GOLD, fontWeight: "800" },
  title: { color: GOLD, fontSize: 17, fontWeight: "800" },
  prompt: { color: "#eceff1", fontSize: 12, lineHeight: 17, textAlign: "center", maxWidth: 560 },
  row: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", columnGap: GAP, rowGap: GAP + 14, marginTop: 6 },
  card: { alignItems: "center", gap: 4 },
  lifted: { transform: [{ translateY: -10 }] },
  dimmed: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, borderRadius: 8, backgroundColor: "rgba(5, 11, 16, 0.5)" },
  pickedTile: { borderColor: GOLD, borderWidth: 3 },
  badge: { position: "absolute", top: -10, alignSelf: "center", backgroundColor: GOLD, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2 },
  badgeText: { color: "#1d1406", fontWeight: "800", fontSize: 12 },
  num: { position: "absolute", top: -9, left: -6, width: 26, height: 26, borderRadius: 13, backgroundColor: GOLD, alignItems: "center", justifyContent: "center" },
  numAuto: { backgroundColor: "rgba(11, 23, 32, 0.9)", borderWidth: 1, borderColor: "rgba(210, 165, 77, 0.5)" },
  numText: { color: "#1d1406", fontWeight: "800", fontSize: 13 },
  numAutoText: { color: "#95a4ad" },
  nudge: { flexDirection: "row", alignItems: "center", gap: 2, height: 28 },
  nudgeBtn: { width: 28, height: 28, borderRadius: 6, borderWidth: 1, borderColor: "rgba(210, 165, 77, 0.3)", backgroundColor: "rgba(17, 33, 45, 0.95)", alignItems: "center", justifyContent: "center" },
  nudgeText: { color: "#eceff1", fontSize: 10 },
  slot: { color: GOLD, fontWeight: "800", fontSize: 13, minWidth: 16, textAlign: "center" },
  effectText: { color: "#eceff1", fontSize: 10, lineHeight: 13, textAlign: "center", height: 26, overflow: "hidden" },
  axis: { flexDirection: "row", alignItems: "center", gap: 8, width: "100%", maxWidth: 520 },
  axisText: { color: "#95a4ad", fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  axisLine: { flex: 1, height: 1, backgroundColor: "rgba(210, 165, 77, 0.5)" },
  note: { color: "#eceff1", fontSize: 12, textAlign: "center" },
  actions: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8 },
  primary: { backgroundColor: "#d9a441", borderRadius: 10, paddingHorizontal: 18, paddingVertical: 12, minWidth: 150, alignItems: "center" },
  primaryText: { color: "#1d1406", fontWeight: "800", fontSize: 14 },
  secondary: { backgroundColor: "#1d3344", borderColor: "rgba(210, 165, 77, 0.3)", borderWidth: 1, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 12 },
  buttonText: { color: "#eceff1", fontWeight: "700", fontSize: 14 },
  seg: { flexDirection: "row" },
  segBtn: { paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: "rgba(210, 165, 77, 0.3)", backgroundColor: "#11212d" },
  segOn: { borderColor: "#d2a54d", backgroundColor: "rgba(210, 165, 77, 0.22)" },
  segOnText: { color: GOLD },
  off: { opacity: 0.35 },
});
