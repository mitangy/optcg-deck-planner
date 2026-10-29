import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Dialog, DialogTitle } from "@optcg/ui/popups";
import { ackWarning, fetchWarnings, type PlayerWarning } from "./warningsApi";

type Props = {
  signedIn: boolean;
  load?: () => Promise<PlayerWarning[]>;
  ack?: (id: number) => Promise<void>;
};

/** A moderator's warning, one at a time, until the player says they understand (which acknowledges it on the server). */
export function WarningNotice({ signedIn, load = fetchWarnings, ack = ackWarning }: Props) {
  const [queue, setQueue] = useState<PlayerWarning[]>([]);

  useEffect(() => {
    if (!signedIn) {
      setQueue([]);
      return;
    }
    let live = true;
    load()
      .then((list) => live && setQueue(list))
      .catch(() => undefined);
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn]);

  const current = queue[0];
  if (!current) return null;

  const understood = () => {
    setQueue((q) => q.filter((w) => w.id !== current.id));
    // A failed acknowledgement just means the notice comes back next visit.
    void ack(current.id).catch(() => undefined);
  };

  return (
    <Dialog open onClose={() => undefined} role="alertdialog" closeOnOutsideClick={false} className="moved-overlay" panelClassName="moved-card warning-card">
      <DialogTitle as="h2">A moderator sent you a warning</DialogTitle>
      <p className="warning-message">{current.message}</p>
      <p className="warning-rules">
        Please read the <Link to="/conduct">Rules of conduct</Link>.
      </p>
      <div className="moved-actions">
        <button type="button" className="btn btn-primary" onClick={understood}>
          I understand
        </button>
      </div>
    </Dialog>
  );
}
