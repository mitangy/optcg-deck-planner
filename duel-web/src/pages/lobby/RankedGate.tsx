import { Dialog } from "@optcg/ui/popups";
import { googleLoginUrl } from "../../net/api";

/** Shown instead of queueing when a guest picks Ranked: Bounty and match history need an account (#1391). */
export function RankedGate({ onClose, onBot }: { onClose: () => void; onBot: () => void }) {
  return (
    <Dialog open onClose={onClose} className="sheet-backdrop" panelClassName="sheet" label="Ranked needs an account">
      <div className="sheet-head">
        <span className="icon-btn-spacer" aria-hidden />
        <h2 className="sheet-title">Ranked needs an account</h2>
        <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
          ✕
        </button>
      </div>
      <div className="sheet-body">
        <p className="field-hint ranked-gate-copy">Sign in so your Bounty and match history are saved.</p>
        <a className="btn btn-primary btn-lg sheet-confirm" href={googleLoginUrl()}>
          Sign in
        </a>
        <button type="button" className="btn btn-lg sheet-confirm" onClick={onBot}>
          Play vs Bot instead
        </button>
      </div>
    </Dialog>
  );
}
