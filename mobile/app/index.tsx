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
import { getGameServerUrl } from "../src/config";
import { useDuelSession } from "../src/state/DuelSession";

export default function ConnectScreen() {
  const router = useRouter();
  const { connect } = useDuelSession();
  const [serverUrl, setServerUrl] = useState(getGameServerUrl());
  const [devUserId, setDevUserId] = useState("mobile-dev");
  const [secret, setSecret] = useState("");
  const [roomId, setRoomId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go(mode: "create" | "join") {
    if (!devUserId.trim()) {
      setError("devUserId is required");
      return;
    }
    if (mode === "join" && !roomId.trim()) {
      setError("Room id required to join");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await connect({
        serverUrl: serverUrl.trim(),
        devUserId: devUserId.trim(),
        secret: secret.trim() || undefined,
        roomId: mode === "join" ? roomId.trim() : undefined,
      });
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
        Step 3 board — curated real cards, server-authoritative intents. Private prototype
        only (names/art for local testing).
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

      <Text style={styles.label}>devUserId</Text>
      <TextInput
        style={styles.input}
        autoCapitalize="none"
        value={devUserId}
        onChangeText={setDevUserId}
        placeholder="mobile-dev"
        placeholderTextColor="#607d8b"
      />

      <Text style={styles.label}>Join secret (optional)</Text>
      <TextInput
        style={styles.input}
        autoCapitalize="none"
        value={secret}
        onChangeText={setSecret}
        placeholder="matches DEV_JOIN_SECRET"
        placeholderTextColor="#607d8b"
      />

      <Text style={styles.label}>Room id (for Join)</Text>
      <TextInput
        style={styles.input}
        autoCapitalize="none"
        value={roomId}
        onChangeText={setRoomId}
        placeholder="paste from other device"
        placeholderTextColor="#607d8b"
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.actions}>
        <Pressable
          style={[styles.btn, styles.primary]}
          disabled={busy}
          onPress={() => go("create")}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnText}>Create duel</Text>
          )}
        </Pressable>
        <Pressable
          style={[styles.btn, styles.secondary]}
          disabled={busy}
          onPress={() => go("join")}
        >
          <Text style={styles.btnText}>Join by room id</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    padding: 20,
    backgroundColor: "#071016",
    gap: 8,
  },
  brand: {
    color: "#ffcc80",
    fontSize: 28,
    fontWeight: "800",
    marginTop: 12,
    letterSpacing: 0.5,
  },
  sub: { color: "#90a4ae", fontSize: 13, lineHeight: 18, marginBottom: 12 },
  label: { color: "#cfd8dc", fontSize: 12, fontWeight: "600", marginTop: 6 },
  input: {
    backgroundColor: "#102027",
    borderWidth: 1,
    borderColor: "#37474f",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#eceff1",
    fontSize: 15,
    minHeight: 44,
  },
  error: { color: "#ef9a9a", marginTop: 8 },
  actions: { marginTop: 16, gap: 10 },
  btn: {
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    minHeight: 48,
    justifyContent: "center",
  },
  primary: { backgroundColor: "#2e7d32" },
  secondary: { backgroundColor: "#1565c0" },
  btnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
});
