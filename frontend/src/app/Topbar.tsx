import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { BrandWordmark } from "../ui/BrandWordmark";

export function Topbar({ brandTo = "/", nav, children }: { brandTo?: string; nav?: ReactNode; children: ReactNode }) {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <div className="brand">
          <Link to={brandTo} aria-label="OPTCG Planner">
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
