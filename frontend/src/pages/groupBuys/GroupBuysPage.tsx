import { GroupBuysListSkeleton } from "../../Skeleton";
import { ShipIcon } from "../../ThemeIcons";
import { api, money } from "../../api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";

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

  if (listQ.isLoading) return <GroupBuysListSkeleton />;
  if (listQ.error) return <p className="error">{(listQ.error as Error).message}</p>;

  const rows = listQ.data ?? [];

  return (
    <section>
      <div className="page-head">
        <div>
          <p className="eyebrow">Sail together</p>
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
        <div className="empty-state">
          <ShipIcon />
          <h2>No crew orders yet</h2>
          <p>Start a group buy above, then share the invite link so friends can add their lists.</p>
        </div>
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
