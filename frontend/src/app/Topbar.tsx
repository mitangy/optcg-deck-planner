import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { BrandWordmark } from "../ui/BrandWordmark";

/**
 * The full-width top bar shared by the signed-in shell, the public share page and the public
 * screens. The bar spans the viewport; only `topbar-inner` is width-constrained (CLAUDE.md UI polish).
 * `nav` is the optional primary nav row; `children` fill the right-hand `.user` cluster.
 */
export function Topbar({ brandTo = "/", nav, children }: { brandTo?: string; nav?: ReactNode; children: ReactNode }) {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <div className="brand">
          <Link to={brandTo}>
            <BrandWordmark />
            <span>Planner</span>
          </Link>
        </div>
        {nav}
        <div className="user">{children}</div>
      </div>
    </header>
  );
}
