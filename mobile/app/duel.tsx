import { useRouter } from "expo-router";
import React, { useEffect } from "react";
import { DuelBoard } from "../src/board/DuelBoard";
import { useDuelSession } from "../src/state/DuelSession";

export default function DuelScreen() {
  const router = useRouter();
  const {
    connected,
    view,
    seat,
    matchId,
    errorBanner,
    matchOver,
    sendIntent,
    leave,
    clearError,
  } = useDuelSession();

  useEffect(() => {
    if (!connected && !view) {
      router.replace("/");
    }
  }, [connected, view, router]);

  return (
    <DuelBoard
      view={view}
      seat={seat}
      matchId={matchId}
      errorBanner={errorBanner}
      matchOver={matchOver}
      onSendIntent={sendIntent}
      onLeave={async () => {
        await leave();
        router.replace("/");
      }}
      onClearError={clearError}
    />
  );
}
