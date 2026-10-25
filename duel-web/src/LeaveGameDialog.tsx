import { Dialog, DialogTitle } from "@optcg/ui/popups";

/** Asked before Log Pose's "Open in deck builder" takes the player off a game page (#728). */
export function LeaveGameDialog({ open, onLeave, onStay }: { open: boolean; onLeave: () => void; onStay: () => void }) {
  return (
    <Dialog open={open} onClose={onStay} role="alertdialog" className="moved-overlay" panelClassName="moved-card">
      <DialogTitle as="h2">Leave this game to open the deck builder?</DialogTitle>
      <div className="moved-actions">
        <button type="button" className="btn btn-primary" onClick={onLeave}>
          Leave
        </button>
        <button type="button" className="btn btn-secondary" onClick={onStay}>
          Stay
        </button>
      </div>
    </Dialog>
  );
}
