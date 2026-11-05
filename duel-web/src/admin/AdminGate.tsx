import { useEffect, useState } from "react";
import { NavMenu } from "../nav/NavMenu";
import { fetchAuthMe } from "../net/api";
import { BackLink } from "../pages/BackLink";
import { type AdminMe, fetchAdminMe } from "./adminApi";
import type { Actor } from "./UserActions";

export type Who = { status: "loading" } | { status: "none" } | { status: "ok"; me: AdminMe; actor: Actor };

/** Signed-in staff (admin or moderator) or not: the check every admin screen starts with. */
export function useAdminWho(): Who {
  const [who, setWho] = useState<Who>({ status: "loading" });
  useEffect(() => {
    let live = true;
    Promise.all([fetchAuthMe(), fetchAdminMe()])
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
    <div className="app-shell">
      <div className="page page-narrow">
        <header className="page-header">
          <NavMenu />
          <BackLink to={b.to} label={b.label} ariaLabel={b.ariaLabel} />
          <h1 className="page-title">{title}</h1>
        </header>
        {children}
      </div>
    </div>
  );
}
