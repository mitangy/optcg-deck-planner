import { useState } from "react";
import { Select } from "@optcg/ui/popups";
import { type AdminUser, type Role, banUser, deleteUser, setUserRole, unbanUser } from "./adminApi";
import { canBanUser, canDeleteUser } from "./adminLogic";

export type Actor = { id: number; role: Role };

export function userLabel(u: Pick<AdminUser, "username" | "name" | "email">): string {
  return u.username || u.name || u.email;
}

/**
 * Role / ban / delete calls shared by the Users list and the user page. `onChange` gets the updated row, or null once
 * the account is deleted. Prompts and error notices live here so both screens behave the same.
 */
export function useUserActions(onChange: (user: AdminUser, next: AdminUser | null) => void) {
  const [busyId, setBusyId] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function act(u: AdminUser, run: () => Promise<AdminUser | void>) {
    setBusyId(u.id);
    setNotice(null);
    try {
      const next = await run();
      onChange(u, next ?? null);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "That did not work.");
    } finally {
      setBusyId(null);
    }
  }

  return {
    busyId,
    notice,
    setNotice,
    setRole: (u: AdminUser, role: "user" | "moderator") => void act(u, () => setUserRole(u.id, role)),
    unban: (u: AdminUser) => void act(u, () => unbanUser(u.id)),
    ban: (u: AdminUser) => {
      const reason = window.prompt(`Ban ${userLabel(u)}? They are signed out everywhere and cannot sign in.\nReason (optional, shown to staff):`, "");
      if (reason === null) return;
      void act(u, () => banUser(u.id, reason));
    },
    remove: (u: AdminUser) => {
      const word = u.username || u.email;
      const typed = window.prompt(`Delete ${word} and everything tied to the account. This cannot be undone.\nType ${word} to confirm:`, "");
      if (typed === null) return;
      if (typed.trim() !== word) {
        setNotice("Not deleted: what you typed did not match.");
        return;
      }
      void act(u, async () => {
        await deleteUser(u.id);
      });
    },
  };
}

type Actions = ReturnType<typeof useUserActions>;

export function RoleControl({ actor, user, busy, actions }: { actor: Actor; user: AdminUser; busy: boolean; actions: Actions }) {
  if (actor.role !== "admin") return <span className={`adm-pill adm-pill-${user.role === "user" ? "mid" : "ok"}`}>{user.role}</span>;
  return (
    <Select<string>
      aria-label={`Role for ${userLabel(user)}`}
      value={user.role}
      disabled={user.role === "admin" || user.id === actor.id || busy}
      onChange={(role) => actions.setRole(user, role as "user" | "moderator")}
      options={[
        ...(user.role === "admin" ? [{ value: "admin", label: "admin" }] : []),
        { value: "user", label: "user" },
        { value: "moderator", label: "moderator" },
      ]}
    />
  );
}

export function UserButtons({ actor, user, busy, actions }: { actor: Actor; user: AdminUser; busy: boolean; actions: Actions }) {
  const mayBan = canBanUser(actor, user);
  const mayDelete = canDeleteUser(actor, user);
  return (
    <>
      {user.banned_at != null ? (
        <button type="button" className="btn btn-secondary btn-sm" disabled={!mayBan || busy} onClick={() => actions.unban(user)}>
          Unban
        </button>
      ) : (
        <button type="button" className="btn btn-secondary btn-sm" disabled={!mayBan || busy} onClick={() => actions.ban(user)}>
          Ban
        </button>
      )}
      {actor.role === "admin" ? (
        <button type="button" className="btn btn-secondary btn-sm adm-delete" disabled={!mayDelete || busy} onClick={() => actions.remove(user)}>
          Delete
        </button>
      ) : null}
    </>
  );
}
