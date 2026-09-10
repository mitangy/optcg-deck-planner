import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { getApiBaseUrl, getGameServerUrl } from "../src/config";
import { mintDevGameToken } from "../src/net/api";
import { useDuelSession } from "../src/state/DuelSession";

export default function ConnectScreen() {
  const router = useRouter();
  const { connect, queueRanked, cancelQueue, queueing, setRating } = useDuelSession();
  const [serverUrl, setServerUrl] = useState(getGameServerUrl());
  const [apiUrl] = useState(getApiBaseUrl());
  const [userKey, setUserKey] = useState("mobile-dev");
  const [secret, setSecret] = useState("");
  const [roomId, setRoomId] = useState("");
  const [useToken, setUseToken] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ratingLabel, setRatingLabel] = useState<string | null>(null);

  async function authOpts() {
    if (!useToken) {
      return {
        serverUrl: serverUrl.trim(),
        devUserId: userKey.trim(),
        secret: secret.trim() || undefined,
      };
    }
    const minted = await mintDevGameToken(userKey.trim());
    setRating(minted.rating);
    setRatingLabel(`${minted.rating} (${minted.games_played} games)`);
    return {
      serverUrl: serverUrl.trim(),
      gameToken: minted.token,
      secret: secret.trim() || undefined,
    };
  }

  async function go(mode: "create" | "join" | "queue" | "spectate") {
    if (!userKey.trim()) {
      setError("user key is required");
      return;
    }
    if ((mode === "join" || mode === "spectate") && !roomId.trim()) {
      setError("Room id required to join / spectate");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const opts = await authOpts();
      if (mode === "queue") {
        await queueRanked(opts);
      } else {
        await connect({
          ...opts,
          roomId: mode === "create" ? undefined : roomId.trim(),
          role: mode === "spectate" ? "spectator" : "player",
        });
      }
      router.push("/duel");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connect failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.root}>
      <Text style={styles.brand}>OPTCG Duel</Text>
      <Text style={styles.sub}>
        Step 5 lobby — ranked queue, spectate, bearer game tokens, reconnect. Private prototype only.
      </Text>

      <Text style={styles.label}>Game server URL</Text>
      <TextInput
        style={styles.input}
        autoCapitalize="none"
        autoCorrect={false}
        value={serverUrl}
        onChangeText={setServerUrl}
        placeholder="http://192.168.x.x:2567"
        placeholderTextColor="#607d8b"
      />

      <Text style={styles.meta}>API: {apiUrl}</Text>

      <Text style={styles.label}>User key (dev token / legacy id)</Text>
      <TextInput
        style={styles.input}
        autoCapitalize="none"
        value={userKey}
        onChangeText={setUserKey}
        placeholder="mobile-dev"
        placeholderTextColor="#607d8b"
      />

      <Pressable
        style={styles.toggle}
        onPress={() => setUseToken((v) => !v)}
      >
        <Text style={styles.toggleText}>
          Auth: {useToken ? "POST /duel/dev-token (bearer)" : "legacy devUserId"}
        </Text>
      </Pressable>
      {ratingLabel ? (
        <Text style={styles.meta}>Rating: {ratingLabel}</Text>
      ) : null}

      <Text style={styles.label}>Join secret (optional)</Text>
      <TextInput
        style={styles.input}
        autoCapitalize="none"
        value={secret}
        onChangeText={setSecret}
        placeholder="matches DEV_JOIN_SECRET"
        placeholderTextColor="#607d8b"
      />

      <Text style={styles.label}>Room id (manual join)</Text>
      <TextInput
        style={styles.input}
        autoCapitalize="none"
        value={roomId}
        onChangeText={setRoomId}
        placeholder="paste from other device"
        placeholderTextColor="#607d8b"
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {queueing ? <Text style={styles.meta}>In ranked queue…</Text> : null}

      <View style={styles.actions}>
        <Pressable
          style={[styles.btn, styles.primary]}
          disabled={busy || queueing}
          onPress={() => go("queue")}
        >
          {busy || queueing ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnText}>Ranked queue</Text>
          )}
        </Pressable>
        {queueing ? (
          <Pressable
            style={[styles.btn, styles.danger]}
            onPress={() => cancelQueue()}
          >
            <Text style={styles.btnText}>Cancel queue</Text>
          </Pressable>
        ) : null}
        <Pressable
          style={[styles.btn, styles.secondary]}
          disabled={busy || queueing}
          onPress={() => go("create")}
        >
          <Text style={styles.btnText}>Create duel</Text>
        </Pressable>
        <Pressable
          style={[styles.btn, styles.secondary]}
          disabled={busy || queueing}
          onPress={() => go("join")}
        >
          <Text style={styles.btnText}>Join by room id</Text>
        </Pressable>
        <Pressable
          style={[styles.btn, styles.secondary]}
          disabled={busy || queueing}
          onPress={() => go("spectate")}
        >
          <Text style={styles.btnText}>Spectate room</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#0d1b22",
    padding: 20,
    paddingTop: 56,
    gap: 8,
  },
  brand: { color: "#eceff1", fontSize: 28, fontWeight: "800" },
  sub: { color: "#90a4ae", marginBottom: 12, lineHeight: 20 },
  label: { color: "#b0bec5", fontSize: 12, fontWeight: "600", marginTop: 6 },
  meta: { color: "#78909c", fontSize: 12 },
  input: {
    backgroundColor: "#102a33",
    borderWidth: 1,
    borderColor: "#37474f",
    borderRadius: 8,
    color: "#fff",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  toggle: {
    alignSelf: "flex-start",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: "#1a237e",
  },
  toggleText: { color: "#c5cae9", fontSize: 12, fontWeight: "600" },
  error: { color: "#ef9a9a", marginTop: 8 },
  actions: { marginTop: 16, gap: 10 },
  btn: {
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  primary: { backgroundColor: "#2e7d32" },
  secondary: { backgroundColor: "#37474f" },
  danger: { backgroundColor: "#c62828" },
  btnText: { color: "#fff", fontWeight: "700" },
});
