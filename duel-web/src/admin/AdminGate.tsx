import { PageShell } from "../layout/PageShell";
import { useEffect, useState } from "react";
import { ensureAuth } from "../auth/session";
import { type AdminMe, fetchAdminMe } from "./adminApi";
import type { Actor } from "./UserActions";

export type Who = { status: "loading" } | { status: "none" } | { status: "ok"; me: AdminMe; actor: Actor };

/** Signed-in staff (admin or moderator) or not: the check every admin screen starts with. */
export function useAdminWho(): Who {
  const [who, setWho] = useState<Who>({ status: "loading" });
  useEffect(() => {
    let live = true;
    Promise.all([ensureAuth(), fetchAdminMe()])
      .then(([u, me]) => {
        if (!live) return;
        if (!u || (me.role !== "admin" && me.role !== "moderator")) return setWho({ status: "none" });
        setWho({ status: "ok", me, actor: { id: u.id, role: me.role } });
      })
      .catch(() => live && setWho({ status: "none" }));
    return () => {
      live = false;
    };
  }, []);
  return who;
}

export function Gate({ title, children, back }: { title: string; children: React.ReactNode; back?: { to: string; label: string; ariaLabel: string } }) {
  const b = back ?? { to: "/", label: "Home", ariaLabel: "Back to home" };
  return (
    <PageShell pageClass="page-narrow" back={b} title={title}>
      {children}
    </PageShell>
  );
}
