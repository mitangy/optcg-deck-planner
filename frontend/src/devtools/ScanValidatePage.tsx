/** Dev-only page: runs the production scan pipeline over fixture photos.
 *
 * Visit /dev/scan-validate locally. Photos and the descriptor bundle live in
 * public/dev-fixtures/ (gitignored); regenerate with
 * `npm run extract-descriptors -- public/dev-fixtures/refs public/dev-fixtures/desc`.
 */

import { useEffect, useState } from "react";
import { runScanValidation, type ScanCase, type ScanCaseResult } from "./scanValidate";

const MANIFEST_URL = "/dev-fixtures/desc/descriptors.manifest.json";
const BASE_URL = "/dev-fixtures/desc";

/** Real phone photos: two gold-foil SEC cards, three lying sideways. */
const CASES: ScanCase[] = [
  { label: "OP16-119 — Teach SEC, gold foil", photoUrl: "/dev-fixtures/user/IMG_4468.jpg", expect: "OP16-119" },
  { label: "EB03-055 — Nico Robin SR, gold foil", photoUrl: "/dev-fixtures/user/IMG_4470.jpg", expect: "EB03-055" },
  { label: "OP13-037 — Zoro, sideways", photoUrl: "/dev-fixtures/user/IMG_4471.jpg", expect: "OP13-037" },
  { label: "OP11-070 — Charlotte Pudding", photoUrl: "/dev-fixtures/user/IMG_4472.jpg", expect: "OP11-070" },
  { label: "OP11-119 — Koby SEC, foil, sideways", photoUrl: "/dev-fixtures/user/IMG_4473.jpg", expect: "OP11-119" },
  { label: "OP10-014 — Franky, sideways", photoUrl: "/dev-fixtures/user/IMG_4474.jpg", expect: "OP10-014" },
];

export default function ScanValidatePage() {
  const [results, setResults] = useState<ScanCaseResult[] | null>(null);
  const [count, setCount] = useState(0);
  const [status, setStatus] = useState("starting");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    runScanValidation(CASES, MANIFEST_URL, BASE_URL, (m) => !cancelled && setStatus(m))
      .then(({ results: r, candidateCount }) => {
        if (cancelled) return;
        setResults(r);
        setCount(candidateCount);
      })
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : String(err)));
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <pre style={{ padding: 16, color: "#f66", whiteSpace: "pre-wrap" }}>{error}</pre>;
  if (!results) return <p style={{ padding: 16, color: "#eee" }}>Running… {status}</p>;

  const passed = results.filter((r) => r.correct).length;
  const cell = { padding: 8, borderTop: "1px solid #333" } as const;
  return (
    <div style={{ padding: 16, fontFamily: "monospace", color: "#eee", background: "#111", minHeight: "100vh" }}>
      <h1>
        Scan pipeline: {passed}/{results.length} correct
      </h1>
      <p style={{ color: "#aaa", fontSize: 13 }}>
        {count} reference printings. "examined" is how many candidates were verified before the walk
        stopped — the ordering hash's job is to make that small, and it can only cost time, never
        correctness.
      </p>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr style={{ textAlign: "left" }}>
            <th style={{ padding: 8 }}>Case</th>
            <th style={{ padding: 8 }}>Expected</th>
            <th style={{ padding: 8 }}>Got</th>
            <th style={{ padding: 8 }}>Inliers</th>
            <th style={{ padding: 8 }}>Runner-up</th>
            <th style={{ padding: 8 }}>Examined</th>
            <th style={{ padding: 8 }}>ms</th>
            <th style={{ padding: 8 }}>Pass</th>
          </tr>
        </thead>
        <tbody>
          {results.map((r) => (
            <tr key={r.label}>
              <td style={cell}>{r.label}</td>
              <td style={cell}>{r.expect}</td>
              <td style={cell}>{r.got ?? "—"}</td>
              <td style={cell}>{r.inliers}</td>
              <td style={cell}>{r.runnerUp}</td>
              <td style={cell}>
                {r.examined} / {count}
              </td>
              <td style={cell}>{r.ms}</td>
              <td style={{ ...cell, color: r.correct ? "#8f8" : "#f66" }}>{r.correct ? "✅" : "❌"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
