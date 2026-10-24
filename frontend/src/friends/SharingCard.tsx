import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { friendsApi, type Sharing, type SharingUpdate } from "./friendsApi";

/** First visit: a clear ask. After that: the four switches, always visible so nothing expands. */
export function SharingCard() {
  const qc = useQueryClient();
  const { data, error } = useQuery({ queryKey: ["sharing"], queryFn: friendsApi.sharing });
  const save = useMutation({
    mutationFn: (body: SharingUpdate) => friendsApi.setSharing(body),
    // Switches flip right away and snap back if the save fails.
    onMutate: async (body) => {
      await qc.cancelQueries({ queryKey: ["sharing"] });
      const before = qc.getQueryData<Sharing>(["sharing"]);
      if (before) qc.setQueryData<Sharing>(["sharing"], { ...before, ...body });
      return { before };
    },
    onError: (_e, _body, ctx) => {
      if (ctx?.before) qc.setQueryData(["sharing"], ctx.before);
    },
    onSuccess: (next) => {
      qc.setQueryData(["sharing"], next);
      void qc.invalidateQueries({ queryKey: ["friend"] });
    },
  });

  if (error) return <p className="error">{(error as Error).message}</p>;
  if (!data) return <section className="friend-card sharing-card sharing-loading" aria-busy="true" />;

  if (!data.prompted) {
    return (
      <section className="friend-card sharing-card sharing-prompt" aria-label="Sharing">
        <h2>Let friends see your collection and spares?</h2>
        <p className="muted">Friends can already see your decks. Share your collection and spares too and they can offer you trades. You can change this any time.</p>
        <div className="sharing-prompt-actions">
          <button type="button" className="btn primary" disabled={save.isPending} onClick={() => save.mutate({ decks: "friends", collection: "friends", trades_open: true })}>
            Share collection and spares
          </button>
          <button type="button" className="btn secondary" disabled={save.isPending} onClick={() => save.mutate({ decks: "friends", collection: "off", trades_open: false })}>
            Just my decks
          </button>
        </div>
        {save.isError && <p className="error">{(save.error as Error).message}</p>}
      </section>
    );
  }

  const rows: { key: string; label: string; hint: string; checked: boolean; disabled?: boolean; patch: (on: boolean) => SharingUpdate }[] = [
    { key: "decks", label: "Decks", hint: "Friends can see your decks (except ones you hide).", checked: data.decks === "friends", patch: (on) => ({ decks: on ? "friends" : "off" }) },
    { key: "collection", label: "Collection", hint: "Friends can see the cards you own.", checked: data.collection === "friends", patch: (on) => ({ collection: on ? "friends" : "off", ...(on ? {} : { show_values: false }) }) },
    { key: "trades", label: "Open to trades", hint: "Friends can see your spares and offer trades.", checked: data.trades_open, patch: (on) => ({ trades_open: on }) },
    { key: "values", label: "Show prices", hint: "Friends see what your collection is worth.", checked: data.show_values, disabled: data.collection !== "friends", patch: (on) => ({ show_values: on }) },
  ];

  return (
    <section className="friend-card sharing-card" aria-label="Sharing">
      <h2>Sharing</h2>
      <ul className="sharing-list">
        {rows.map((r) => (
          <li key={r.key}>
            <label className={r.disabled ? "disabled" : ""}>
              <input
                type="checkbox"
                role="switch"
                checked={r.checked}
                disabled={r.disabled}
                onChange={(e) => save.mutate(r.patch(e.target.checked))}
              />
              <span className="sharing-text">
                <strong>{r.label}</strong>
                <span className="muted">{r.hint}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      {save.isError && <p className="error">{(save.error as Error).message}</p>}
    </section>
  );
}

export function useSharing() {
  return useQuery<Sharing>({ queryKey: ["sharing"], queryFn: friendsApi.sharing });
}
