import React, { useMemo, useState } from "react";
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { lookupCard } from "../cards/atlas";

const COLOR_CHIP: Record<string, string> = {
  red: "#c62828",
  green: "#2e7d32",
  blue: "#1565c0",
  purple: "#6a1b9a",
  black: "#212121",
  yellow: "#f9a825",
};

type Props = {
  defId: string;
  rested?: boolean;
  power?: number;
  attachedDonCount?: number;
  compact?: boolean;
  selected?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
};

export function CardTile({
  defId,
  rested,
  power,
  attachedDonCount,
  compact,
  selected,
  onPress,
  style,
}: Props) {
  const entry = useMemo(() => lookupCard(defId), [defId]);
  const [imgFailed, setImgFailed] = useState(false);
  const chip = COLOR_CHIP[entry.colors[0] ?? ""] ?? "#455a64";
  const w = compact ? 64 : 88;
  const h = compact ? 90 : 124;

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={[
        styles.tile,
        { width: w, height: h, borderColor: selected ? "#ffd54f" : "#263238" },
        rested ? styles.rested : null,
        style,
      ]}
    >
      {!imgFailed && entry.imageUrl ? (
        <Image
          source={{ uri: entry.imageUrl }}
          style={styles.art}
          resizeMode="cover"
          onError={() => setImgFailed(true)}
        />
      ) : (
        <View style={[styles.fallback, { backgroundColor: chip }]}>
          <Text style={styles.fallbackId}>{entry.id}</Text>
        </View>
      )}
      <View style={styles.caption}>
        <Text numberOfLines={2} style={styles.name}>
          {entry.name}
        </Text>
        <Text style={styles.meta}>
          {`C${entry.cost}`}
          {power != null ? ` · ${power}` : entry.power != null ? ` · ${entry.power}` : ""}
          {attachedDonCount ? ` · DON×${attachedDonCount}` : ""}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    borderRadius: 8,
    borderWidth: 2,
    overflow: "hidden",
    backgroundColor: "#102027",
  },
  rested: { opacity: 0.55 },
  art: { flex: 1, width: "100%" },
  fallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 4,
  },
  fallbackId: { color: "#fff", fontSize: 10, fontWeight: "700" },
  caption: {
    backgroundColor: "rgba(0,0,0,0.72)",
    paddingHorizontal: 4,
    paddingVertical: 3,
  },
  name: { color: "#fff", fontSize: 10, fontWeight: "600" },
  meta: { color: "#b0bec5", fontSize: 9 },
});
