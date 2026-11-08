import { useMemo } from "react";
import { DeckDetail } from "../api";
import { buildOptcgSimExport } from "./shopping/optcgsimExport";
import { HeadPopover } from "../ui/HeadPopover";

function ShareStatus({
  message,
  openUrl,
}: {
  message: string | null;
  openUrl?: string | null;
}) {
  if (!message) return null;
  return (
    <p className="share-banner" role="status">
      {message.startsWith("http") ? (
        <>
          Public link: <a href={message}>{message}</a>
        </>
      ) : (
        message
      )}
      {openUrl && !message.startsWith("http") ? (
        <>
          {" "}
          · <a href={openUrl}>Open</a>
        </>
      ) : null}
    </p>
  );
}

export function ShoppingSharePanel({
  shareInfo,
  shareUrl,
  shareMsg,
  creating,
  revoking,
  onCopy,
  onCreateOrUpdate,
  onRevoke,
}: {
  shareInfo: { token: string } | null | undefined;
  shareUrl: string | null;
  shareMsg: string | null;
  creating: boolean;
  revoking: boolean;
  onCopy: () => void;
  onCreateOrUpdate: () => void;
  onRevoke: () => void;
}) {
  return (
    <HeadPopover label="Share" badge={shareInfo ? "On" : undefined} panelLabel="Public link">
      <div className="share-panel">
        <h3 className="head-popover-title">Public link</h3>
        <p className="muted share-panel-note">
          Anyone with the link can view this shopping list without signing in.
        </p>
        <div className="share-panel-actions">
          {shareInfo ? (
            <>
              <button type="button" className="btn secondary" onClick={onCopy}>
                Copy link
              </button>
              <button
                type="button"
                className="btn secondary"
                disabled={creating}
                onClick={onCreateOrUpdate}
              >
                {creating ? "Updating…" : "Update link"}
              </button>
              <button
                type="button"
                className="ghost danger"
                disabled={revoking}
                onClick={onRevoke}
              >
                Turn off
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn secondary"
              disabled={creating}
              onClick={onCreateOrUpdate}
            >
              {creating ? "Creating…" : "Create public link"}
            </button>
          )}
        </div>
        <ShareStatus message={shareMsg} openUrl={shareUrl} />
      </div>
    </HeadPopover>
  );
}

export function DeckSharePanel({
  shareMsg,
  sharing,
  onShare,
}: {
  shareMsg: string | null;
  sharing: boolean;
  onShare: () => void;
}) {
  return (
    <div className="share-panel">
        <h3 className="head-popover-title">Public link</h3>
        <p className="muted share-panel-note">
          Anyone with the link can view this deck without signing in.
        </p>
        <div className="share-panel-actions">
          <button type="button" className="btn secondary" disabled={sharing} onClick={onShare}>
            {sharing ? "Sharing…" : shareMsg ? "Copy public link" : "Create public link"}
          </button>
        </div>
        <ShareStatus message={shareMsg} />
    </div>
  );
}

export function DeckExportPanel({
  deck,
  exportMsg,
  onCopy,
  onDownload,
}: {
  deck: DeckDetail;
  exportMsg: string | null;
  onCopy: () => void;
  onDownload: () => void;
}) {
  const exportable = useMemo(
    () => buildOptcgSimExport(deck.cards, { leaderCardId: deck.leader_card_id }),
    [deck],
  );
  const empty = exportable.lineCount === 0;
  const summary = empty
    ? "empty"
    : `${exportable.lineCount} line${exportable.lineCount === 1 ? "" : "s"}`;

  return (
    <div className="share-panel">
        <h3 className="head-popover-title">
          Export for OPTCGSim <span className="muted">· {summary}</span>
        </h3>
        <p className="muted share-panel-note">
          Copy or download a deck list in OPTCGSim format (
          <code>4xOP15-053</code>), then use Import from Clipboard in the simulator. DON!! cards are
          omitted.
        </p>
        <div className="share-panel-actions">
          <button type="button" className="btn secondary" disabled={empty} onClick={onCopy}>
            Copy deck list
          </button>
          <button type="button" className="btn secondary" disabled={empty} onClick={onDownload}>
            Download .txt
          </button>
        </div>
        <ShareStatus message={exportMsg} />
    </div>
  );
}
