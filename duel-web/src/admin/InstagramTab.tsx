import { useCallback, useEffect, useRef, useState } from "react";
import {
  type IgPost,
  type IgReel,
  type IgReelsCheck,
  checkIgReels,
  deleteIgReel,
  fetchIgPosts,
  fetchIgReels,
  updateIgReel,
  uploadIgReel,
} from "./adminApi";
import { formatBytes, reelsCheckText, songLabel, stampOf } from "./adminLogic";

type Load = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; reels: IgReel[]; posts: IgPost[] };
type Check = { status: "idle" } | { status: "busy" } | { status: "error"; message: string } | { status: "done"; result: IgReelsCheck };

const KIND_LABELS: Record<string, string> = { reel: "Reel", meta_chart: "Meta chart", card_spotlight: "Card spotlight", feature: "Feature tip" };
const errText = (e: unknown) => (e instanceof Error ? e.message : "That did not work.");

function CheckPanel() {
  const [check, setCheck] = useState<Check>({ status: "idle" });
  async function run() {
    setCheck({ status: "busy" });
    try {
      setCheck({ status: "done", result: await checkIgReels() });
    } catch (e) {
      setCheck({ status: "error", message: errText(e) });
    }
  }
  const text = check.status === "done" ? reelsCheckText(check.result) : null;
  return (
    <div className="igt-check">
      <button type="button" className="btn btn-secondary btn-sm" disabled={check.status === "busy"} aria-busy={check.status === "busy"} onClick={() => void run()}>
        Check Reels setup
      </button>
      <p className="igt-check-text" role="status" data-ready={text ? String(text.ready) : undefined}>
        {check.status === "busy" ? "Asking Instagram…" : null}
        {check.status === "error" ? `Could not check: ${check.message}` : null}
        {text ? (
          <>
            <b>{text.headline}</b> <span className="adm-muted">{text.detail}</span>
          </>
        ) : null}
      </p>
    </div>
  );
}

function UploadForm({ onUploaded }: { onUploaded: (r: IgReel) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!file || !title.trim()) return;
    setBusy(true);
    setError(null);
    try {
      onUploaded(await uploadIgReel(file, title.trim(), caption));
      setFile(null);
      setTitle("");
      setCaption("");
      if (fileRef.current) fileRef.current.value = "";
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="igt-form"
      aria-label="Upload a Reel"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <label className="rpt-field">
        <span>Video (mp4, up to 100 MB)</span>
        <input ref={fileRef} type="file" accept="video/mp4" disabled={busy} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </label>
      <label className="rpt-field">
        <span>Title (only you see it)</span>
        <input type="text" value={title} maxLength={120} disabled={busy} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label className="rpt-field">
        <span>Caption (the disclaimer and hashtags are added)</span>
        <textarea value={caption} rows={3} maxLength={1500} disabled={busy} onChange={(e) => setCaption(e.target.value)} />
      </label>
      <div className="igt-form-actions">
        <button type="submit" className="btn btn-primary btn-sm" disabled={busy || !file || !title.trim()} aria-busy={busy}>
          {busy ? "Uploading…" : "Upload Reel"}
        </button>
        <span className="adm-error" role="alert">
          {error ?? ""}
        </span>
      </div>
    </form>
  );
}

function ReelRow({ reel, onChange, onDeleted }: { reel: IgReel; onChange: (r: IgReel) => void; onDeleted: (id: number) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function act(run: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await run();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <li className="igt-reel" data-active={reel.active ? "true" : "false"}>
      <div className="igt-reel-main">
        <b className="igt-reel-title">{reel.title}</b>
        <span className="adm-muted igt-reel-meta">
          {formatBytes(reel.size_bytes)} · posted {reel.posted_count}× · {reel.last_posted_at ? `last ${stampOf(reel.last_posted_at)}` : "never posted"}
        </span>
      </div>
      <label className="igt-active">
        <input type="checkbox" checked={reel.active} disabled={busy} onChange={(e) => void act(async () => onChange(await updateIgReel(reel.id, { active: e.target.checked })))} />
        <span>Active</span>
      </label>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        disabled={busy}
        onClick={() => {
          if (window.confirm(`Delete the reel "${reel.title}"? Past posts stay in the list.`)) void act(async () => (await deleteIgReel(reel.id), onDeleted(reel.id)));
        }}
      >
        Delete
      </button>
      <p className="adm-error igt-reel-error" role="alert">
        {error ?? ""}
      </p>
    </li>
  );
}

function PostRow({ post }: { post: IgPost }) {
  const song = songLabel(post);
  return (
    <li className="igt-post">
      <span className="igt-post-date">{post.slot_date}</span>
      <span className="adm-pill adm-pill-mid">{KIND_LABELS[post.kind] ?? post.kind}</span>
      <span className={`adm-pill adm-pill-${post.status === "published" ? "ok" : post.status === "failed" ? "bad" : "warn"}`}>{post.status}</span>
      <span className="igt-post-song">{song ? `♪ ${song}` : ""}</span>
      <span className="adm-error igt-post-error">{post.error ?? ""}</span>
      {post.reel_error ? <span className="adm-muted igt-post-error">{post.reel_error}. Posted an image instead.</span> : null}
    </li>
  );
}

export function InstagramTab() {
  const [data, setData] = useState<Load>({ status: "loading" });
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(() => {
    setRefreshing(true);
    Promise.all([fetchIgReels(), fetchIgPosts()])
      .then(([reels, posts]) => setData({ status: "ready", reels, posts }))
      .catch((e: Error) => setData((d) => (d.status === "ready" ? d : { status: "error", message: e.message })))
      .finally(() => setRefreshing(false));
  }, []);
  useEffect(load, [load]);

  const setReels = (f: (r: IgReel[]) => IgReel[]) => setData((d) => (d.status === "ready" ? { ...d, reels: f(d.reels) } : d));

  return (
    <section className="panel igt" aria-label="Instagram">
      <div className="adm-toolbar">
        <h2 className="panel-title igt-title">Reels</h2>
        <button type="button" className="btn btn-secondary btn-sm adm-refresh" onClick={load} disabled={refreshing} aria-busy={refreshing}>
          Refresh
        </button>
      </div>
      <p className="panel-copy adm-muted igt-hint">On the set weekdays the day's post is one of these videos with a trending song. If anything goes wrong, that day's normal image is posted instead.</p>
      <CheckPanel />
      <UploadForm onUploaded={(r) => setReels((rs) => [r, ...rs])} />
      {data.status === "loading" ? <p className="panel-copy adm-muted">Loading…</p> : null}
      {data.status === "error" ? (
        <p className="adm-error" role="alert">
          Could not load Instagram data: {data.message}
        </p>
      ) : null}
      {data.status === "ready" ? (
        <>
          {data.reels.length === 0 ? (
            <p className="panel-copy adm-muted">No reels yet. Upload one above.</p>
          ) : (
            <ul className="igt-list" aria-label="Reels">
              {data.reels.map((r) => (
                <ReelRow key={r.id} reel={r} onChange={(n) => setReels((rs) => rs.map((x) => (x.id === n.id ? n : x)))} onDeleted={(id) => setReels((rs) => rs.filter((x) => x.id !== id))} />
              ))}
            </ul>
          )}
          <h2 className="panel-title igt-title">Recent posts</h2>
          {data.posts.length === 0 ? (
            <p className="panel-copy adm-muted">Nothing posted yet.</p>
          ) : (
            <ul className="igt-list" aria-label="Recent posts">
              {data.posts.map((p) => (
                <PostRow key={p.id} post={p} />
              ))}
            </ul>
          )}
        </>
      ) : null}
    </section>
  );
}
