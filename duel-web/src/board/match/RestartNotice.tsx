import { serverRestartNotice } from "../../state/serverRestart";

/** Floats over the board (fixed, click-through) so showing it never moves the playmat. */
export function RestartNotice({ seconds }: { seconds: number }) {
  return (
    <div className="restart-notice" role="status" data-testid="restart-notice">
      {serverRestartNotice(seconds)}
    </div>
  );
}
