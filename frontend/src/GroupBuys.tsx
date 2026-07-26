import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  api,
  GroupBuyDetail,
  GroupBuyLine,
  money,
} from "./api";
import { blankMassEntryUrl, buildMassEntryExport } from "./tcgplayerMassEntry";

const NEXT_KEY = "optcg_login_next";

export function rememberLoginNext(path: string) {
  try {
    sessionStorage.setItem(NEXT_KEY, path);
  } catch {
    /* ignore */
  }
}

export function consumeLoginNext(): string | null {
  try {
    const next = sessionStorage.getItem(NEXT_KEY);
    if (next) sessionStorage.removeItem(NEXT_KEY);
    return next;
  } catch {
    return null;
  }
}

function memberBreakdown(line: GroupBuyLine): string {
  return line.members
    .map((m) => `${m.display_name} ×${m.qty}${m.is_custom ? "*" : ""}`)
    .join(" · ");
}

function BuyQtyEditor({
  cardId,
  qty,
  suggestedQty,
  isCustom,
  disabled,
  onSave,
  onReset,
}: {
  cardId: string;
  qty: number;
  suggestedQty: number;
  isCustom: boolean;
  disabled: boolean;
  onSave: (qty: number) => void;
  onReset: () => void;
}) {
  const [draft, setDraft] = useState(String(qty));

  useEffect(() => {
    setDraft(String(qty));
  }, [qty, cardId]);

  function commit() {
    const n = Math.max(0, Math.min(999, Math.floor(Number(draft))));
    if (!Number.isFinite(n)) {
      setDraft(String(qty));
      return;
    }
    setDraft(String(n));
    if (n !== qty) onSave(n);
  }

  return (
    <div className="group-buy-qty">
      <div className="group-buy-qty-controls">
        <button
          type="button"
          className="owned-btn"
          aria-label={`Decrease buy qty for ${cardId}`}
          disabled={disabled || qty <= 0}
          onClick={() => onSave(Math.max(0, qty - 1))}
        >
          −
        </button>
        <input
          className="group-buy-qty-input"
          inputMode="numeric"
          aria-label={`Buy quantity for ${cardId}`}
          value={draft}
          disabled={disabled}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.currentTarget.blur();
            }
          }}
        />
        <button
          type="button"
          className="owned-btn"
          aria-label={`Increase buy qty for ${cardId}`}
          disabled={disabled || qty >= 999}
          onClick={() => onSave(Math.min(999, qty + 1))}
        >
          +
        </button>
      </div>
      <div className="group-buy-qty-meta muted">
        {isCustom ? (
          <>
            Shopping suggests {suggestedQty}{" "}
            <button type="button" className="ghost" disabled={disabled} onClick={onReset}>
              Use suggested
            </button>
          </>
        ) : (
          <>From shopping</>
        )}
      </div>
    </div>
  );
}

export function GroupBuysPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const listQ = useQuery({ queryKey: ["group-buys"], queryFn: api.groupBuys });
  const [title, setTitle] = useState("Group buy");
  const [msg, setMsg] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => api.createGroupBuy({ title: title.trim() || "Group buy" }),
    onSuccess: async (detail) => {
      await qc.invalidateQueries({ queryKey: ["group-buys"] });
      navigate(`/group-buys/${detail.id}`);
    },
    onError: (e: Error) => setMsg(e.message),
  });

  if (listQ.isLoading) return <p className="muted">Loading group buys…</p>;
  if (listQ.error) return <p className="error">{(listQ.error as Error).message}</p>;

  const rows = listQ.data ?? [];

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>Group buys</h1>
          <p className="muted">
            Combine friends’ shopping lists into one bulk order to save on shipping.
          </p>
        </div>
      </div>

      <form
        className="group-buy-create"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <label>
          Title
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            placeholder="Friday night group buy"
          />
        </label>
        <button type="submit" className="btn primary" disabled={create.isPending}>
          {create.isPending ? "Creating…" : "Start group buy"}
        </button>
      </form>
      {msg && <p className="error">{msg}</p>}

      {rows.length === 0 ? (
        <p className="muted">No group buys yet. Start one and share the invite link.</p>
      ) : (
        <ul className="group-buy-list">
          {rows.map((g) => (
            <li key={g.id}>
              <Link to={`/group-buys/${g.id}`} className="group-buy-card">
                <div className="group-buy-card-top">
                  <strong>{g.title}</strong>
                  <span className={`group-buy-status status-${g.status}`}>{g.status}</span>
                </div>
                <p className="muted">
                  Host {g.host_name} · {g.member_count} member{g.member_count === 1 ? "" : "s"} ·{" "}
                  {g.cards_still_needed} copies · {money(g.remaining_market)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function GroupBuyDetailPage() {
  const { id } = useParams();
  const groupId = Number(id);
  const qc = useQueryClient();
  const [msg, setMsg] = useState<string | null>(null);
  const [inviteMsg, setInviteMsg] = useState<string | null>(null);

  const detailQ = useQuery({
    queryKey: ["group-buy", groupId],
    queryFn: () => api.groupBuy(groupId),
    enabled: Number.isFinite(groupId) && groupId > 0,
  });
  const decksQ = useQuery({ queryKey: ["decks"], queryFn: api.decks });

  const detail = detailQ.data;

  const lock = useMutation({
    mutationFn: () => api.lockGroupBuy(groupId),
    onSuccess: async (d) => {
      qc.setQueryData(["group-buy", groupId], d);
      await qc.invalidateQueries({ queryKey: ["group-buys"] });
      setMsg("Group buy locked — quantities frozen for checkout.");
    },
    onError: (e: Error) => setMsg(e.message),
  });

  const unlock = useMutation({
    mutationFn: () => api.unlockGroupBuy(groupId),
    onSuccess: async (d) => {
      qc.setQueryData(["group-buy", groupId], d);
      await qc.invalidateQueries({ queryKey: ["group-buys"] });
      setMsg("Group buy unlocked — live shopping contributions again.");
    },
    onError: (e: Error) => setMsg(e.message),
  });

  const contribution = useMutation({
    mutationFn: (deckIds: number[] | null) => api.updateGroupBuyContribution(groupId, deckIds),
    onSuccess: (d) => {
      qc.setQueryData(["group-buy", groupId], d);
      setMsg("Updated your contribution decks.");
    },
    onError: (e: Error) => setMsg(e.message),
  });

  const setProduct = useMutation({
    mutationFn: ({ cardId, productId }: { cardId: string; productId: number }) =>
      api.setGroupBuyLineProduct(groupId, cardId, productId),
    onSuccess: (d) => qc.setQueryData(["group-buy", groupId], d),
    onError: (e: Error) => setMsg(e.message),
  });

  const setQty = useMutation({
    mutationFn: ({ cardId, qty }: { cardId: string; qty: number }) =>
      api.setGroupBuyQty(groupId, cardId, qty),
    onSuccess: async (d) => {
      qc.setQueryData(["group-buy", groupId], d);
      await qc.invalidateQueries({ queryKey: ["group-buys"] });
    },
    onError: (e: Error) => setMsg(e.message),
  });

  const clearQty = useMutation({
    mutationFn: (cardId: string) => api.clearGroupBuyQty(groupId, cardId),
    onSuccess: async (d) => {
      qc.setQueryData(["group-buy", groupId], d);
      await qc.invalidateQueries({ queryKey: ["group-buys"] });
    },
    onError: (e: Error) => setMsg(e.message),
  });

  const syncQty = useMutation({
    mutationFn: () => api.syncGroupBuyQuantities(groupId),
    onSuccess: async (d) => {
      qc.setQueryData(["group-buy", groupId], d);
      await qc.invalidateQueries({ queryKey: ["group-buys"] });
      setMsg("Your buy quantities reset to shopping still-need.");
    },
    onError: (e: Error) => setMsg(e.message),
  });

  const remove = useMutation({
    mutationFn: () => api.deleteGroupBuy(groupId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["group-buys"] });
      window.location.href = "/group-buys";
    },
    onError: (e: Error) => setMsg(e.message),
  });

  const qtyBusy = setQty.isPending || clearQty.isPending || syncQty.isPending;

  const meQ = useQuery({ queryKey: ["me"], queryFn: api.me });
  const myContribution = useMemo(() => {
    const me = meQ.data;
    if (!detail || !me) return null;
    return detail.members.find((m) => m.user_id === me.id) ?? null;
  }, [detail, meQ.data]);

  async function copyInvite(path: string) {
    const url = `${window.location.origin}${path}`;
    try {
      await navigator.clipboard.writeText(url);
      setInviteMsg("Invite link copied");
    } catch {
      setInviteMsg(url);
    }
  }

  async function exportMassEntry(d: GroupBuyDetail) {
    try {
      const exported = await api.exportGroupBuyTcgplayer(d.id);
      const local = buildMassEntryExport(
        d.lines.map((line) => ({
          card_id: line.card_id,
          name: line.name,
          still_need: line.total_qty,
          product_id: line.product_id,
        })),
      );
      const paste = exported.paste_text || local.pasteText;
      const url = exported.url || local.url;
      try {
        await navigator.clipboard.writeText(paste);
      } catch {
        setMsg(paste);
        return;
      }
      if (url) {
        window.open(url, "_blank", "noopener,noreferrer");
        setMsg("Opened Mass Entry (list copied). Add to Cart → Optimize Cart.");
      } else {
        window.open(blankMassEntryUrl(), "_blank", "noopener,noreferrer");
        setMsg("List copied — paste into Mass Entry, then Add to Cart → Optimize Cart.");
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    }
  }

  if (!Number.isFinite(groupId) || groupId <= 0) {
    return <p className="error">Invalid group buy.</p>;
  }
  if (detailQ.isLoading) return <p className="muted">Loading group buy…</p>;
  if (detailQ.error) return <p className="error">{(detailQ.error as Error).message}</p>;
  if (!detail) return <p className="error">Group buy not found.</p>;

  const decks = decksQ.data ?? [];
  const activeDeckIds = myContribution?.deck_ids;
  const allSelected = !activeDeckIds || activeDeckIds.length === decks.length;

  return (
    <section>
      <div className="page-head">
        <div>
          <p className="muted">
            <Link to="/group-buys">Group buys</Link>
          </p>
          <h1>{detail.title}</h1>
          <p className="muted">
            <span className={`group-buy-status status-${detail.status}`}>{detail.status}</span>
            {" · "}
            Host {detail.host_name} · {detail.member_count} members · {detail.unique_cards} cards ·{" "}
            {detail.cards_still_needed} copies · {money(detail.remaining_market)}
          </p>
        </div>
      </div>

      <div className="group-buy-toolbar">
        <button type="button" className="btn secondary" onClick={() => void copyInvite(detail.invite_path)}>
          Copy invite link
        </button>
        <button type="button" className="btn primary" onClick={() => void exportMassEntry(detail)}>
          Open Mass Entry
        </button>
        {detail.is_host && detail.status === "open" && (
          <button
            type="button"
            className="btn secondary"
            disabled={lock.isPending}
            onClick={() => lock.mutate()}
          >
            {lock.isPending ? "Locking…" : "Lock for checkout"}
          </button>
        )}
        {detail.is_host && detail.status === "locked" && (
          <button
            type="button"
            className="btn secondary"
            disabled={unlock.isPending}
            onClick={() => unlock.mutate()}
          >
            {unlock.isPending ? "Unlocking…" : "Unlock"}
          </button>
        )}
        {detail.is_host && (
          <button
            type="button"
            className="ghost danger"
            disabled={remove.isPending}
            onClick={() => {
              if (window.confirm("Delete this group buy for everyone?")) remove.mutate();
            }}
          >
            Delete
          </button>
        )}
      </div>
      {(inviteMsg || msg) && (
        <p className="buy-bar-msg buy-bar-msg-solo" role="status">
          {inviteMsg || msg}
        </p>
      )}

      <div className="group-buy-members">
        <h2>Members</h2>
        <ul>
          {detail.members.map((m) => (
            <li key={m.user_id}>
              <strong>
                {m.display_name}
                {m.role === "host" ? " (host)" : ""}
              </strong>
              <span className="muted">
                {" "}
                · {m.cards_still_needed} copies · {money(m.remaining_market)}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {detail.status === "open" && myContribution && (
        <div className="group-buy-contribution">
          <h2>Your contribution</h2>
          <p className="muted">
            Defaults follow your shopping still-need. Edit <strong>Your buy</strong> on any line
            before the host locks.
          </p>
          {decks.length > 0 && (
            <div className="filters">
              <label>
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={() => contribution.mutate(null)}
                />
                All decks
              </label>
              {decks.map((d) => {
                const checked = allSelected || (activeDeckIds?.includes(d.id) ?? false);
                return (
                  <label key={d.id}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={contribution.isPending}
                      onChange={() => {
                        const current = activeDeckIds ?? decks.map((x) => x.id);
                        let next: number[];
                        if (current.includes(d.id)) {
                          next = current.filter((x) => x !== d.id);
                          if (!next.length) next = current;
                        } else {
                          next = [...current, d.id];
                        }
                        if (next.length === decks.length) contribution.mutate(null);
                        else contribution.mutate(next);
                      }}
                    />
                    {d.name}
                  </label>
                );
              })}
            </div>
          )}
          <div className="group-buy-contribution-actions">
            <button
              type="button"
              className="btn secondary"
              disabled={syncQty.isPending || detail.status !== "open"}
              onClick={() => syncQty.mutate()}
            >
              {syncQty.isPending ? "Resetting…" : "Reset my qtys to shopping"}
            </button>
          </div>
        </div>
      )}

      <h2>Merged list</h2>
      {detail.lines.length === 0 ? (
        <p className="muted">Nothing to buy yet — members need cards on their shopping lists.</p>
      ) : (
        <div className="table-wrap">
          <table className="desktop-table">
            <thead>
              <tr>
                <th>Card</th>
                {detail.status === "open" ? <th>Your buy</th> : null}
                <th>Total</th>
                <th>Who</th>
                <th>Est.</th>
                {detail.is_host ? <th>Printing</th> : null}
              </tr>
            </thead>
            <tbody>
              {detail.lines.map((line) => (
                <tr key={line.card_id}>
                  <td>
                    <div className="card-id">{line.card_id}</div>
                    <div>{line.name}</div>
                  </td>
                  {detail.status === "open" ? (
                    <td>
                      <BuyQtyEditor
                        cardId={line.card_id}
                        qty={line.my_qty}
                        suggestedQty={line.my_suggested_qty}
                        isCustom={line.my_is_custom}
                        disabled={qtyBusy}
                        onSave={(qty) => setQty.mutate({ cardId: line.card_id, qty })}
                        onReset={() => clearQty.mutate(line.card_id)}
                      />
                    </td>
                  ) : null}
                  <td>{line.total_qty}</td>
                  <td className="muted">{memberBreakdown(line)}</td>
                  <td>{money(line.remaining_cost)}</td>
                  {detail.is_host ? (
                    <td>
                      {line.product_id || line.alt_arts.length ? (
                        <select
                          className="group-buy-printing"
                          value={line.product_id ?? ""}
                          disabled={setProduct.isPending || !line.alt_arts.length}
                          onChange={(e) => {
                            const productId = Number(e.target.value);
                            if (!productId) return;
                            setProduct.mutate({ cardId: line.card_id, productId });
                          }}
                        >
                          {line.product_id ? (
                            <option value={line.product_id}>
                              Preferred · {money(line.market_price)}
                            </option>
                          ) : (
                            <option value="">No product id</option>
                          )}
                          {line.alt_arts
                            .filter((alt) => alt.product_id !== line.product_id)
                            .map((alt) => (
                              <option key={alt.product_id} value={alt.product_id}>
                                Alt · {alt.name} · {money(alt.market_price)}
                              </option>
                            ))}
                        </select>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mobile-list">
            {detail.lines.map((line) => (
              <article key={line.card_id} className="mobile-card need">
                <div className="mobile-card-body">
                  <div className="card-id">{line.card_id}</div>
                  <div>{line.name}</div>
                  <p className="muted">
                    Total {line.total_qty} · {money(line.remaining_cost)}
                  </p>
                  <p className="muted">{memberBreakdown(line)}</p>
                  {detail.status === "open" ? (
                    <BuyQtyEditor
                      cardId={line.card_id}
                      qty={line.my_qty}
                      suggestedQty={line.my_suggested_qty}
                      isCustom={line.my_is_custom}
                      disabled={qtyBusy}
                      onSave={(qty) => setQty.mutate({ cardId: line.card_id, qty })}
                      onReset={() => clearQty.mutate(line.card_id)}
                    />
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </div>
      )}
      {detail.status === "open" ? (
        <p className="muted group-buy-footnote">* Custom quantity (not shopping still-need)</p>
      ) : null}
    </section>
  );
}

export function GroupBuyJoinPage() {
  const { token = "" } = useParams();
  const navigate = useNavigate();
  const meQ = useQuery({ queryKey: ["me"], queryFn: api.me });
  const previewQ = useQuery({
    queryKey: ["group-buy-invite", token],
    queryFn: () => api.groupBuyInvitePreview(token),
    enabled: Boolean(token),
  });
  const [err, setErr] = useState<string | null>(null);

  const join = useMutation({
    mutationFn: () => api.joinGroupBuy(token),
    onSuccess: (detail) => navigate(`/group-buys/${detail.id}`, { replace: true }),
    onError: (e: Error) => setErr(e.message),
  });

  if (!token) return <p className="error">Missing invite token.</p>;
  if (previewQ.isLoading || meQ.isLoading) return <p className="muted">Loading invite…</p>;
  if (previewQ.error) return <p className="error">{(previewQ.error as Error).message}</p>;
  const preview = previewQ.data!;

  return (
    <section className="group-buy-join">
      <h1>Join group buy</h1>
      <p>
        <strong>{preview.title}</strong>
      </p>
      <p className="muted">
        Hosted by {preview.host_name} · {preview.member_count} member
        {preview.member_count === 1 ? "" : "s"} · {preview.status}
      </p>
      {err && <p className="error">{err}</p>}
      {meQ.data ? (
        <button
          type="button"
          className="btn primary"
          disabled={join.isPending || preview.status === "locked"}
          onClick={() => join.mutate()}
        >
          {join.isPending ? "Joining…" : preview.status === "locked" ? "Locked — cannot join" : "Join group buy"}
        </button>
      ) : (
        <Link
          className="btn primary"
          to={`/login?next=${encodeURIComponent(`/group-buy/join/${token}`)}`}
          onClick={() => rememberLoginNext(`/group-buy/join/${token}`)}
        >
          Sign in to join
        </Link>
      )}
      <p className="muted">
        <Link to="/group-buys">Back to group buys</Link>
      </p>
    </section>
  );
}
