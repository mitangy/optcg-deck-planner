import { PageShell } from "../layout/PageShell";
import { useMemo } from "react";
import { useAsyncResource } from "../lib/useAsyncResource";
import { ensureAuth } from "../auth/session";
import { type AdminMe, fetchAdminMe } from "./adminApi";
import type { Actor } from "./UserActions";

export type Who = { status: "loading" } | { status: "none" } | { status: "ok"; me: AdminMe; actor: Actor };

/** Signed-in staff (admin or moderator) or not: the check every admin screen starts with. */
export function useAdminWho(): Who {
  const res = useAsyncResource(() => Promise.all([ensureAuth(), fetchAdminMe()]), []);
  return useMemo<Who>(() => {
    if (res.status === "loading") return { status: "loading" };
    if (res.status === "error") return { status: "none" };
    const [u, me] = res.data;
    if (!u || (me.role !== "admin" && me.role !== "moderator")) return { status: "none" };
    return { status: "ok", me, actor: { id: u.id, role: me.role } };
  }, [res]);
}

export function Gate({ title, children, back }: { title: string; children: React.ReactNode; back?: { to: string; label: string; ariaLabel: string } }) {
  const b = back ?? { to: "/", label: "Home", ariaLabel: "Back to home" };
  return (
    <PageShell pageClass="page-narrow" back={b} title={title}>
      {children}
    </PageShell>
  );
}
