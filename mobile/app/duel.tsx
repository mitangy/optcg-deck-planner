import { useRouter } from "expo-router";
import React, { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { DuelBoard } from "../src/board/DuelBoard";
import { useDuelSession } from "../src/state/DuelSession";

export default function DuelScreen() {
  const router = useRouter();
  const {
    connected,
    canReconnect,
    view,
    seat,
    role,
    matchId,
    errorBanner,
    matchOver,
    rating,
    sendIntent,
    reconnect,
    concede,
    leave,
    clearError,
  } = useDuelSession();

  const spectating = role === "spectator" || Boolean(view?.spectator);

  useEffect(() => {
    if (!connected && !view && !canReconnect) {
      router.replace("/");
    }
  }, [connected, view, canReconnect, router]);

  return (
    <View style={styles.root}>
      {!connected && canReconnect && view ? (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>Disconnected — reconnect within grace window</Text>
          <Pressable
            style={styles.bannerBtn}
            onPress={async () => {
              try {
                await reconnect();
              } catch (e) {
                clearError();
              }
            }}
          >
            <Text style={styles.bannerBtnText}>Reconnect</Text>
          </Pressable>
        </View>
      ) : null}
      {rating != null ? (
        <Text style={styles.rating}>Your rating: {rating}</Text>
      ) : null}
      {spectating ? (
        <Text style={styles.rating}>Spectating — hands hidden · read-only</Text>
      ) : null}
      <DuelBoard
        view={view}
        seat={seat}
        matchId={matchId}
        errorBanner={errorBanner}
        matchOver={matchOver}
        spectator={spectating}
        onSendIntent={sendIntent}
        onLeave={async () => {
          await leave();
          router.replace("/");
        }}
        onClearError={clearError}
      />
      {connected && !matchOver && !spectating ? (
        <Pressable style={styles.concede} onPress={() => concede()}>
          <Text style={styles.concedeText}>Concede</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0d1b22" },
  banner: {
    backgroundColor: "#e65100",
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  bannerText: { color: "#fff", flex: 1, fontWeight: "600", fontSize: 12 },
  bannerBtn: {
    backgroundColor: "#fff",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
  },
  bannerBtnText: { color: "#e65100", fontWeight: "800", fontSize: 12 },
  rating: {
    color: "#90a4ae",
    fontSize: 11,
    paddingHorizontal: 12,
    paddingTop: 6,
  },
  concede: {
    position: "absolute",
    right: 12,
    bottom: 88,
    backgroundColor: "#b71c1c",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  concedeText: { color: "#fff", fontWeight: "700", fontSize: 12 },
});
