import { useEffect, useState } from "react";
import { fetchUsernameSuggestion, type AuthUser } from "../net/api";
import { UsernameForm } from "./UsernameForm";

/** Settings → Account: view / change the public duel username. */
export function UsernameSettings({
  user,
  onChange,
}: {
  user: AuthUser;
  onChange: (user: AuthUser) => void;
}) {
  const [initial, setInitial] = useState<string | null>(user.username ?? null);

  useEffect(() => {
    if (user.username) return;
    let cancelled = false;
    void fetchUsernameSuggestion().then((s) => {
      if (!cancelled) setInitial(s ?? "");
    });
    return () => {
      cancelled = true;
    };
  }, [user.username]);

  if (initial === null) {
    return <p className="field-hint username-loading">Loading username…</p>;
  }
  return (
    <UsernameForm
      key={user.id}
      initial={initial}
      current={user.username ?? null}
      submitLabel={user.username ? "Save" : "Set username"}
      onSaved={onChange}
    />
  );
}
