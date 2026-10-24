import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { money } from "../api";
import { CardThumb } from "../CardThumb";
import { friendsApi } from "./friendsApi";
import { lineCap, setLineQty, toLinesIn, trayTotals, type TrayLine } from "./tradeLogic";
import { QtyStepper } from "./ui";
import { useFriendSpares } from "./useFriendSpares";

type TrayProps = {
  friendId: number;
  username: string;
  lines: TrayLine[];
  onLines: (next: TrayLine[]) => void;
  message: string;
  onMessage: (next: string) => void;
  /** Set while answering an offer from this friend: Send becomes a counter. */
  counterId: number | null;
  onClear: () => void;
};

/** The offer being built. Fixed to the bottom of the screen so adding cards never moves the page. */
export function TradeTray(props: TrayProps) {
  if (props.lines.length === 0 && props.counterId == null) return null;
  return <TrayInner {...props} />;
}

function TrayInner({ friendId, username, lines, onLines, message, onMessage, counterId, onClear }: TrayProps) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const { capFor } = useFriendSpares(friendId);
  const totals = trayTotals(lines);
  const send = useMutation({
    mutationFn: () => {
      const body = { message: message.trim(), lines: toLinesIn(lines) };
      return counterId != null ? friendsApi.counterTrade(counterId, body) : friendsApi.sendTrade({ to_user_id: friendId, ...body });
    },
    onError: () => setOpen(true),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["trades"] });
      void qc.invalidateQueries({ queryKey: ["trades-summary"] });
      void qc.invalidateQueries({ queryKey: ["friend", friendId, "spares"] });
      onClear();
      navigate("/friends?tab=trades");
    },
  });
  const verb = counterId != null ? "Counter" : "Offer";

  const group = (side: "give" | "get", title: string) => {
    const rows = lines.filter((l) => l.side === side);
    return (
      <div className="tray-group">
        <h3>
          {title} <span className="muted">{side === "give" ? money(totals.giveValue) : money(totals.getValue)}</span>
        </h3>
        {rows.length === 0 ? (
          <p className="muted tray-none">Nothing</p>
        ) : (
          <ul className="tray-lines">
            {rows.map((l) => {
              const cap = capFor(l.side, l.cardId, lines);
              return (
                <li key={`${l.cardId}-${l.productId ?? "base"}`} className="tray-line">
                  <CardThumb src={l.imageUrl || undefined} cardId={l.cardId} alt={l.name} />
                  <span className="trade-line-text">
                    <span className="trade-line-name">{l.name}</span>
                    <span className="muted trade-line-sub">
                      {l.cardId}
                      {l.printingLabel ? ` · ${l.printingLabel}` : ""}
                    </span>
                  </span>
                  <QtyStepper value={l.qty} max={lineCap(lines, l, cap)} label={`${l.cardId} in tray`} onChange={(n) => onLines(setLineQty(lines, l, n, cap))} />
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  };

  return (
    <div className="trade-tray" role="region" aria-label="Trade tray">
      {open && (
        <div className="trade-tray-panel">
          <div className="tray-groups">
            {group("give", "You give")}
            {group("get", "You get")}
          </div>
          <label className="friend-field">
            <span>Message (optional)</span>
            <textarea value={message} maxLength={500} rows={2} placeholder={`Say hi to ${username}`} onChange={(e) => onMessage(e.target.value)} />
          </label>
          {send.isError && (
            <p className="error" role="alert">
              {(send.error as Error).message}
            </p>
          )}
          <button type="button" className="ghost danger tray-clear" onClick={onClear}>
            {counterId != null ? "Discard counter" : "Clear tray"}
          </button>
        </div>
      )}
      <div className="trade-tray-bar">
        <button type="button" className="trade-tray-toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          <span className="trade-tray-title">
            {verb} to {username}
          </span>
          <span className="trade-tray-sums">
            Give {totals.giveCopies} · Get {totals.getCopies}
          </span>
          <span className="trade-tray-chevron" aria-hidden>
            {open ? "▾" : "▴"}
          </span>
        </button>
        <button type="button" className="btn primary" disabled={lines.length === 0 || send.isPending} onClick={() => send.mutate()}>
          {counterId != null ? "Send counter" : "Send offer"}
        </button>
      </div>
    </div>
  );
}
