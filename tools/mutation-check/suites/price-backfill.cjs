/** Price history backfill script mutations (backend/scripts/test_backfill_price_history.py, unittest) (#950). */
const F = "backend/scripts/backfill_price_history.py";
module.exports = {
  cwd: "backend/scripts",
  runner: "unittest",
  module: "test_backfill_price_history",
  mutations: [
    { id: "backfill-failed-day-aborts-run", file: F, from: `        except Exception as exc:  # noqa: BLE001 - any per-day failure skips that day only`, to: `        except KeyboardInterrupt as exc:`, kills: ["test_a_day_whose_download_keeps_failing_is_skipped_and_the_run_continues_950", "test_a_corrupt_archive_is_skipped_and_the_run_continues_950"] },
    { id: "backfill-failed-days-exit-zero", file: F, from: `    if failed:\n`, to: `    if False:\n`, kills: ["test_a_day_whose_download_keeps_failing_is_skipped_and_the_run_continues_950", "test_a_corrupt_archive_is_skipped_and_the_run_continues_950"] },
    { id: "backfill-clean-run-exits-nonzero", file: F, from: `        return 1\n    return 0`, to: `        return 1\n    return 1`, kills: ["test_a_clean_run_exits_zero_950"] },
    { id: "backfill-download-three-tries", file: F, from: `DOWNLOAD_DELAYS_S = (5, 15, 30, 60, 120)`, to: `DOWNLOAD_DELAYS_S = (5, 15)`, kills: ["test_download_retries_past_three_transient_failures_950"] },
  ],
};
