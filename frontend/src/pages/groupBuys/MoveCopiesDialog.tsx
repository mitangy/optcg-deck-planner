import { Dialog, DialogTitle, Select } from "@optcg/ui/popups";
import { useMemo, useState, type FormEvent } from "react";
import type { GroupBuyLine, GroupBuyMember } from "../../api";
import { MemberSwatch } from "./memberColors";
import { moveArtChoices, movePreview, moveUnitPrice } from "./offlineMembersModel";

export type MoveCopiesRequest = {
  card_id: string;
  product_id: number | null;
  from_user_id: number;
  to_user_id: number;
  qty: number;
};

const memberOption = (m: GroupBuyMember, members: GroupBuyMember[]) => ({
  value: String(m.user_id),
  label: (
    <span className="gb-buying-opt">
      <MemberSwatch userId={m.user_id} members={members} />
      {m.display_name}
    </span>
  ),
  buttonLabel: m.display_name,
});

/** Who a member's copies can go to: only people who are not on the app are on one side of a move. */
function targetsFor(from: GroupBuyMember, members: GroupBuyMember[]): GroupBuyMember[] {
  return members.filter((m) => m.user_id !== from.user_id && (from.is_offline || m.is_offline));
}

/** Host only: move some of one member's copies of a card to someone else, once the group buy is locked or ordered. */
export function MoveCopiesDialog({
  line,
  members,
  hostId,
  busy,
  error,
  onSubmit,
  onClose,
}: {
  line: GroupBuyLine;
  members: GroupBuyMember[];
  hostId: number | null;
  busy: boolean;
  error: string | null;
  onSubmit: (req: MoveCopiesRequest) => void;
  onClose: () => void;
}) {
  const holders = useMemo(
    () => members.filter((m) => moveArtChoices(line, m.user_id).length > 0 && targetsFor(m, members).length > 0),
    [line, members],
  );
  const firstHolder = holders.find((m) => m.user_id === hostId) ?? holders[0] ?? null;
  const [fromId, setFromId] = useState<number | null>(firstHolder?.user_id ?? null);
  const from = members.find((m) => m.user_id === fromId) ?? null;
  const targets = from ? targetsFor(from, members) : [];
  const [toPick, setToPick] = useState<number | null>(null);
  const to = targets.find((m) => m.user_id === toPick) ?? targets.find((m) => m.is_offline) ?? targets[0] ?? null;
  const arts = from ? moveArtChoices(line, from.user_id) : [];
  const [artPick, setArtPick] = useState<number | null | undefined>(undefined);
  const art = arts.find((a) => a.product_id === artPick) ?? arts[0] ?? null;
  const [qtyPick, setQtyPick] = useState(1);
  const max = art?.qty ?? 0;
  const qty = Math.max(1, Math.min(qtyPick, max));
  const artName = (id: number | null) =>
    id == null ? "Standard art" : (line.alt_arts?.find((a) => a.product_id === id)?.name ?? `Art ${id}`);
  const title = `Move copies of ${line.name}`;
  const ready = Boolean(from && to && art && max > 0);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!ready || busy || !from || !to || !art) return;
    onSubmit({ card_id: line.card_id, product_id: art.product_id, from_user_id: from.user_id, to_user_id: to.user_id, qty });
  }

  return (
    <Dialog open onClose={onClose} className="gb-dialog gb-dialog-sheet" panelClassName="gb-dialog-panel gb-offline-panel" label={title}>
      <form className="gb-dialog-form" onSubmit={submit} data-testid="gb-move-dialog">
        <div className="gb-dialog-head">
          <DialogTitle as="h2" className="gb-dialog-title">
            {title}
          </DialogTitle>
          <button type="button" className="ghost gb-dialog-x" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="gb-dialog-body">
          {holders.length === 0 ? (
            <p className="muted gb-offline-note">Nobody has copies of this card that can be moved.</p>
          ) : (
            <>
              <div className="gb-offline-field">
                <span id="gb-move-from">From</span>
                <Select
                  value={String(from?.user_id ?? "")}
                  onChange={(v) => {
                    setFromId(Number(v));
                    setToPick(null);
                    setArtPick(undefined);
                  }}
                  options={holders.map((m) => memberOption(m, members))}
                  aria-label="Move from"
                />
              </div>
              <div className="gb-offline-field">
                <span>To</span>
                <Select
                  value={String(to?.user_id ?? "")}
                  onChange={(v) => setToPick(Number(v))}
                  options={targets.map((m) => memberOption(m, members))}
                  aria-label="Move to"
                />
              </div>
              {arts.length > 1 ? (
                <div className="gb-offline-field">
                  <span>Art</span>
                  <Select
                    value={String(art?.product_id ?? "base")}
                    onChange={(v) => setArtPick(v === "base" ? null : Number(v))}
                    options={arts.map((a) => ({
                      value: String(a.product_id ?? "base"),
                      label: `${artName(a.product_id)} · ${a.qty}`,
                      buttonLabel: artName(a.product_id),
                    }))}
                    aria-label="Art"
                  />
                </div>
              ) : null}
              <div className="gb-offline-field">
                <span>How many</span>
                <span className="gb-stepper-ctl">
                  <button type="button" className="owned-btn" aria-label="Fewer" disabled={qty <= 1} onClick={() => setQtyPick(qty - 1)}>
                    −
                  </button>
                  <span className="gb-stepper-val" aria-label={`${qty} of ${max}`} data-testid="gb-move-qty">
                    {qty}/{max}
                  </span>
                  <button type="button" className="owned-btn" aria-label="More" disabled={qty >= max} onClick={() => setQtyPick(qty + 1)}>
                    +
                  </button>
                </span>
              </div>
              {ready && from && to && art ? (
                <p className="gb-move-preview" role="status" data-testid="gb-move-preview">
                  {movePreview(qty, moveUnitPrice(line, art.product_id), from.display_name, to.display_name)}
                </p>
              ) : null}
            </>
          )}
        </div>
        <div className="gb-dialog-foot">
          <p className="error gb-dialog-error" role="alert">
            {error}
          </p>
          <div className="gb-dialog-buttons">
            <button type="button" className="btn secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn primary" disabled={!ready || busy} data-testid="gb-move-save">
              {busy ? "Moving…" : "Move copies"}
            </button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}
