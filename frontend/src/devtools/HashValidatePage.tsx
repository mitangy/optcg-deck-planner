/** Dev-only page: reports hash-match accuracy against real card photos.
 *
 * Visit /dev/hash-validate locally. Photos and reference images live in
 * public/dev-fixtures/ (gitignored — see README below for how to add more).
 */

import { useEffect, useState } from "react";
import { runStructureValidation, type StructureReport } from "./structureValidate";
import { runValidation, type CaseReport, type RefImage, type ValidationCase } from "./hashValidate";
import { runOcrValidation, type OcrCaseReport, type OcrValidationCase } from "./ocrValidate";
import { runOrbValidation, type OrbCaseReport } from "./orbValidate";

/** Entry in public/dev-fixtures/refs/index.json, written by the fetch script. */
type RefIndexEntry = { label: string; file: string; card_id: string };

/**
 * Load the decoy pool from disk rather than hardcoding it.
 *
 * Pool size is the whole point of this harness now: a technique that ranks
 * the right card 2nd out of 13 may be a usable shortlist filter or may just
 * be scoring in the top ~15% — which at catalog scale is useless. Only a
 * large pool distinguishes those, so the pool is data, not code.
 */
async function loadRefs(): Promise<RefImage[]> {
  const res = await fetch("/dev-fixtures/refs/index.json");
  if (!res.ok) throw new Error(`refs/index.json missing (HTTP ${res.status}) — run the fetch script`);
  const entries: RefIndexEntry[] = await res.json();
  return entries.map((e) => ({ label: e.label, url: `/dev-fixtures/refs/${e.file}` }));
}

const CASES: ValidationCase[] = [
  {
    label: "OP14-119 — Mihawk alt art, PSA slab, hand-held",
    photoUrl: "/dev-fixtures/OP14-119.webp",
    correctRefLabel: "OP14-119_alt",
  },
  {
    label: "OP13-119 — Ace, Wanted Poster art, flat-lay",
    photoUrl: "/dev-fixtures/OP13-119.webp",
    correctRefLabel: "OP13-119_wanted",
  },
  {
    label: "OP06-119 — Sanji SEC, heavy foil/holo glare",
    photoUrl: "/dev-fixtures/OP06-119.webp",
    correctRefLabel: "OP06-119_base",
  },
  {
    label: "OP01-041 — Momonosuke, sleeved, plain background",
    photoUrl: "/dev-fixtures/OP01-041.webp",
    correctRefLabel: "OP01-041",
  },
];

const OCR_CASES: OcrValidationCase[] = [
  { label: CASES[0].label, photoUrl: CASES[0].photoUrl, correctCardId: "OP14-119" },
  { label: CASES[1].label, photoUrl: CASES[1].photoUrl, correctCardId: "OP13-119" },
  { label: CASES[2].label, photoUrl: CASES[2].photoUrl, correctCardId: "OP06-119" },
  { label: CASES[3].label, photoUrl: CASES[3].photoUrl, correctCardId: "OP01-041" },
];

function Thumb({ src, caption, sub, bad }: { src: string; caption: string; sub?: string; bad?: boolean }) {
  return (
    <div style={{ textAlign: "center", width: 150 }}>
      <div
        style={{
          height: 190,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#000",
          border: `1px solid ${bad ? "#f66" : "#444"}`,
          overflow: "hidden",
        }}
      >
        {src ? (
          <img src={src} alt={caption} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} />
        ) : (
          <span style={{ color: "#888", fontSize: 12 }}>none</span>
        )}
      </div>
      <div style={{ fontSize: 12, marginTop: 4 }}>{caption}</div>
      {sub && <div style={{ fontSize: 11, color: bad ? "#f66" : "#8f8" }}>{sub}</div>}
    </div>
  );
}

function CaseRow({ r }: { r: CaseReport }) {
  const bestIsCorrect = r.correctIsBest;
  return (
    <div style={{ marginBottom: 32, paddingBottom: 24, borderBottom: "1px solid #333" }}>
      <h3 style={{ margin: "0 0 8px" }}>
        {r.label} {bestIsCorrect ? "✅" : "❌"}
      </h3>
      <div style={{ fontSize: 12, color: "#aaa", marginBottom: 8 }}>
        rectified: {r.rectified ? "yes" : "no (whole-image fallback)"} — correct-ref rank:{" "}
        <strong style={{ color: r.correctRank === 1 ? "#8f8" : "#fc6" }}>
          {r.correctRank ?? "—"} / {r.totalCandidates}
        </strong>
      </div>
      <div style={{ fontSize: 11, color: "#888", marginBottom: 8 }}>
        full ranking: {r.ranked.map((m) => `${m.label}=${m.distance}`).join(", ")}
      </div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <Thumb src={r.photoUrl} caption="1. Original photo" />
        <Thumb src={r.photoPreviewUrl} caption="2. What got hashed" sub={r.rectified ? "rectified crop" : "raw fallback"} />
        <Thumb
          src={r.correctRefPreviewUrl}
          caption="3. Correct reference (hashed)"
          sub={`distance ${r.correctDistance ?? "—"}`}
          bad={!bestIsCorrect}
        />
        <Thumb
          src={r.best?.previewUrl ?? ""}
          caption={`4. Best match found: ${r.best?.label ?? "—"}`}
          sub={`distance ${r.best?.distance ?? "—"}`}
          bad={!bestIsCorrect}
        />
        <Thumb
          src={r.runnerUp?.previewUrl ?? ""}
          caption={`5. Runner-up: ${r.runnerUp?.label ?? "—"}`}
          sub={`distance ${r.runnerUp?.distance ?? "—"}`}
        />
      </div>
    </div>
  );
}

function StructureTable({ reports }: { reports: StructureReport[] }) {
  const cell = { padding: 8, borderTop: "1px solid #333" } as const;
  return (
    <table style={{ borderCollapse: "collapse", width: "100%", marginBottom: 32 }}>
      <thead>
        <tr style={{ textAlign: "left" }}>
          <th style={{ padding: 8 }}>Case</th>
          <th style={{ padding: 8 }}>Rectified?</th>
          <th style={{ padding: 8 }}>Edge: correct dist</th>
          <th style={{ padding: 8 }}>Edge: correct rank</th>
          <th style={{ padding: 8 }}>Edge pass</th>
          <th style={{ padding: 8 }}>ZNCC: correct score</th>
          <th style={{ padding: 8 }}>ZNCC: best score</th>
          <th style={{ padding: 8 }}>ZNCC: correct rank</th>
          <th style={{ padding: 8 }}>ZNCC pass</th>
        </tr>
      </thead>
      <tbody>
        {reports.map((r) => (
          <tr key={r.label}>
            <td style={cell}>{r.label}</td>
            <td style={{ ...cell, color: r.rectified ? "#8f8" : "#fc6" }}>
              {r.rectified ? "yes" : "no (fallback)"}
            </td>
            <td style={cell}>{r.edgeCorrectDistance ?? "—"}</td>
            <td style={{ ...cell, color: r.edgeCorrectRank === 1 ? "#8f8" : "#fc6" }}>
              {r.edgeCorrectRank ?? "—"} / {r.totalCandidates}
            </td>
            <td style={{ ...cell, color: r.edgeCorrectIsBest ? "#8f8" : "#f66" }}>
              {r.edgeCorrectIsBest ? "✅" : `❌ ${r.edgeBestLabel ?? ""}`}
            </td>
            <td style={cell}>{r.znccCorrectScore?.toFixed(3) ?? "—"}</td>
            <td style={cell}>
              {r.znccBestScore?.toFixed(3) ?? "—"}
              {r.znccRunnerUpScore != null ? ` (2nd ${r.znccRunnerUpScore.toFixed(3)})` : ""}
            </td>
            <td style={{ ...cell, color: r.znccCorrectRank === 1 ? "#8f8" : "#fc6" }}>
              {r.znccCorrectRank ?? "—"} / {r.totalCandidates}
            </td>
            <td style={{ ...cell, color: r.znccCorrectIsBest ? "#8f8" : "#f66" }}>
              {r.znccCorrectIsBest ? "✅" : `❌ ${r.znccBestLabel ?? ""}`}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function OcrTable({ reports }: { reports: OcrCaseReport[] }) {
  return (
    <table style={{ borderCollapse: "collapse", width: "100%", marginBottom: 32 }}>
      <thead>
        <tr style={{ textAlign: "left" }}>
          <th style={{ padding: 8 }}>Case</th>
          <th style={{ padding: 8 }}>Raw tokens</th>
          <th style={{ padding: 8 }}>Repaired ids</th>
          <th style={{ padding: 8 }}>Got correct set?</th>
          <th style={{ padding: 8 }}>Got exact id?</th>
        </tr>
      </thead>
      <tbody>
        {reports.map((r) => (
          <tr key={r.label}>
            <td style={{ padding: 8, borderTop: "1px solid #333" }}>{r.label}</td>
            <td style={{ padding: 8, borderTop: "1px solid #333" }}>{r.rawTokens.join(", ") || "—"}</td>
            <td style={{ padding: 8, borderTop: "1px solid #333" }}>{r.repairedIds.join(", ") || "—"}</td>
            <td
              style={{ padding: 8, borderTop: "1px solid #333", color: r.gotCorrectSet ? "#8f8" : "#f66" }}
            >
              {r.gotCorrectSet ? `✅ (${r.correctSet})` : `❌ (wanted ${r.correctSet})`}
            </td>
            <td style={{ padding: 8, borderTop: "1px solid #333", color: r.gotExactId ? "#8f8" : "#fc6" }}>
              {r.gotExactId ? "✅" : "—"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function OrbTable({ reports }: { reports: OrbCaseReport[] }) {
  return (
    <table style={{ borderCollapse: "collapse", width: "100%", marginBottom: 32 }}>
      <thead>
        <tr style={{ textAlign: "left" }}>
          <th style={{ padding: 8 }}>Case</th>
          <th style={{ padding: 8 }}>old: correct</th>
          <th style={{ padding: 8 }}>old: best</th>
          <th style={{ padding: 8 }}>old: rank</th>
          <th style={{ padding: 8 }}>old pass</th>
          <th style={{ padding: 8, color: "#9cf" }}>verify: correct inliers</th>
          <th style={{ padding: 8, color: "#9cf" }}>verify: best</th>
          <th style={{ padding: 8, color: "#9cf" }}>verify: runner-up</th>
          <th style={{ padding: 8, color: "#9cf" }}>verify: rank</th>
          <th style={{ padding: 8, color: "#9cf" }}>survivors</th>
          <th style={{ padding: 8, color: "#9cf" }}>ms/candidate</th>
          <th style={{ padding: 8, color: "#9cf" }}>verify pass</th>
        </tr>
      </thead>
      <tbody>
        {reports.map((r) => (
          <tr key={r.label}>
            <td style={{ padding: 8, borderTop: "1px solid #333" }}>{r.label}</td>
            <td style={{ padding: 8, borderTop: "1px solid #333" }}>{r.correct?.goodMatches ?? "—"}</td>
            <td style={{ padding: 8, borderTop: "1px solid #333" }}>
              {r.best?.label ?? "—"} ({r.best?.goodMatches ?? "—"})
            </td>
            <td style={{ padding: 8, borderTop: "1px solid #333", color: r.correctRank === 1 ? "#8f8" : "#fc6" }}>
              {r.correctRank ?? "—"} / {r.totalCandidates}
            </td>
            <td style={{ padding: 8, borderTop: "1px solid #333", color: r.correctIsBest ? "#8f8" : "#f66" }}>
              {r.correctIsBest ? "✅" : "❌"}
            </td>
            <td style={{ padding: 8, borderTop: "1px solid #333" }}>
              {r.verifyCorrect?.inliers ?? "—"}
              {r.verifyCorrect ? ` (${r.verifyCorrect.good} good)` : ""}
            </td>
            <td style={{ padding: 8, borderTop: "1px solid #333" }}>
              {r.verifyBest?.label ?? "—"} ({r.verifyBest?.inliers ?? "—"})
            </td>
            <td style={{ padding: 8, borderTop: "1px solid #333" }}>
              {r.verifyRunnerUp ? `${r.verifyRunnerUp.label} (${r.verifyRunnerUp.inliers})` : "—"}
            </td>
            <td
              style={{ padding: 8, borderTop: "1px solid #333", color: r.verifyCorrectRank === 1 ? "#8f8" : "#fc6" }}
            >
              {r.verifyCorrectRank ?? "—"} / {r.totalCandidates}
            </td>
            <td style={{ padding: 8, borderTop: "1px solid #333" }}>{r.verifySurvivors}</td>
            <td style={{ padding: 8, borderTop: "1px solid #333" }}>
              {(r.verifyMs / Math.max(1, r.totalCandidates)).toFixed(0)} ms
            </td>
            <td style={{ padding: 8, borderTop: "1px solid #333", color: r.verifyCorrectIsBest ? "#8f8" : "#f66" }}>
              {r.verifyCorrectIsBest ? "✅" : "❌"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function HashValidatePage() {
  const [reports, setReports] = useState<CaseReport[] | null>(null);
  const [orbReports, setOrbReports] = useState<OrbCaseReport[] | null>(null);
  const [orbError, setOrbError] = useState<string | null>(null);
  const [ocrReports, setOcrReports] = useState<OcrCaseReport[] | null>(null);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [structReports, setStructReports] = useState<StructureReport[] | null>(null);
  const [structError, setStructError] = useState<string | null>(null);
  const [poolSize, setPoolSize] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadRefs()
      .then((refs) => {
        if (cancelled) return;
        setPoolSize(refs.length);
        // ORB is ~0.2s per pair, so at a 100-ref pool it is by far the
        // slowest of these; kick the cheap ones off first so their numbers
        // land while it grinds.
        runStructureValidation(CASES, refs)
          .then(setStructReports)
          .catch((err) => setStructError(err instanceof Error ? err.message : String(err)));
        runValidation(CASES, refs)
          .then(setReports)
          .catch((err) => setError(err instanceof Error ? err.message : String(err)));
        runOcrValidation(OCR_CASES)
          .then(setOcrReports)
          .catch((err) => setOcrError(err instanceof Error ? err.message : String(err)));
        runOrbValidation(CASES, refs)
          .then(setOrbReports)
          .catch((err) => setOrbError(err instanceof Error ? err.message : String(err)));
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <pre style={{ padding: 16, color: "#f66", whiteSpace: "pre-wrap" }}>
        {error}
        {"\n\n"}Make sure dev fixture images exist under frontend/public/dev-fixtures/ (see task 5 of the scan-hash
        plan).
      </pre>
    );
  }
  if (!reports) return <p style={{ padding: 16, color: "#eee" }}>Running validation…</p>;

  const passCount = reports.filter((r) => r.correctIsBest).length;
  const orbPassCount = orbReports?.filter((r) => r.correctIsBest).length;
  const orbVerifyPassCount = orbReports?.filter((r) => r.verifyCorrectIsBest).length;
  const ocrSetCount = ocrReports?.filter((r) => r.gotCorrectSet).length;
  const edgePassCount = structReports?.filter((r) => r.edgeCorrectIsBest).length;
  const znccPassCount = structReports?.filter((r) => r.znccCorrectIsBest).length;

  return (
    <div style={{ padding: 16, fontFamily: "monospace", color: "#eee", background: "#111", minHeight: "100vh" }}>
      <p style={{ color: "#fc6", fontSize: 14 }}>
        Decoy pool: <strong>{poolSize ?? "…"}</strong> reference printings. Ranks below are out of this pool —
        compare against the earlier 13-ref run to see whether a technique holds a near-top floor or just scores
        in a fixed percentile.
      </p>
      <h1>
        Edge hash {structReports ? `${edgePassCount}/${structReports.length}` : "…"} · ZNCC{" "}
        {structReports ? `${znccPassCount}/${structReports.length}` : "…"}
      </h1>
      <p style={{ color: "#aaa", fontSize: 13, marginTop: -8 }}>
        Edge hash: Sobel → percentile threshold → per-cell edge density, so bits describe printed structure
        rather than brightness. ZNCC: no hashing at all — mean-centered unit-norm grayscale thumbnails compared
        by correlation, which is affine-brightness invariant and keeps magnitudes instead of 1 bit per cell.
      </p>
      {structError && <pre style={{ color: "#f66", whiteSpace: "pre-wrap" }}>{structError}</pre>}
      {structReports && <StructureTable reports={structReports} />}

      <h1>
        OCR narrows to correct set: {ocrReports ? `${ocrSetCount}/${ocrReports.length}` : "running…"}
      </h1>
      <p style={{ color: "#aaa", fontSize: 13, marginTop: -8 }}>
        Existing tesseract.js pipeline, unmodified — testing whether even a partial/fuzzy read reliably narrows
        to the right set (not the exact card), which would be enough to shrink an ORB search to one set instead
        of the whole catalog.
      </p>
      {ocrError && <pre style={{ color: "#f66", whiteSpace: "pre-wrap" }}>{ocrError}</pre>}
      {ocrReports && <OcrTable reports={ocrReports} />}

      <h1>
        ORB: old {orbReports ? `${orbPassCount}/${orbReports.length}` : "…"} · homography verify{" "}
        {orbReports ? `${orbVerifyPassCount}/${orbReports.length}` : "…"}
      </h1>
      <p style={{ color: "#aaa", fontSize: 13, marginTop: -8 }}>
        "old" = count mutually-nearest descriptors under a fixed Hamming threshold. "verify" = Lowe ratio 0.8 →
        findHomography(USAC_MAGSAC, 5.0) → geometry sanity → score by inlier count. "survivors" is how many of
        the {poolSize ?? "?"} candidates produced any homography consensus at all — the useful number, since a
        verifier that rejects almost everything is what makes a shortlist trustworthy.
      </p>
      {orbError && <pre style={{ color: "#f66", whiteSpace: "pre-wrap" }}>{orbError}</pre>}
      {orbReports && <OrbTable reports={orbReports} />}

      <h1>
        Block hash: {passCount}/{reports.length} correct
      </h1>
      {reports.map((r) => (
        <CaseRow key={r.label} r={r} />
      ))}
    </div>
  );
}
