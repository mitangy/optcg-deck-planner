/**
 * ffmpeg x11grab -> a near-lossless intermediate, then one encode to the delivery file
 * (H.264, crf 15, yuv420p, no audio). The intermediate is trimmed to the span the script marks.
 */
import { spawn, type ChildProcess, execFileSync } from "node:child_process";
import { mkdirSync, existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { CAPTURE_FPS, CLIPS_DIR, DISPLAY, FPS, RAW_DIR, STILLS_DIR } from "./env";
import { sleep } from "./util";

export type RecordArea = { width: number; height: number; x?: number; y?: number; display?: string };

export class Recorder {
  private proc: ChildProcess | null = null;
  private t0 = 0;
  private frames = 0;
  private stderrTail = "";
  private dup = 0;
  private drop = 0;
  readonly raw: string;
  /** Seconds (from the first captured frame) the clip starts and ends. */
  private inAt = 0;
  private outAt: number | null = null;
  /** Finished spans; a clip with a hidden stretch in the middle (a page load, a setup) has several. */
  private spans: [number, number][] = [];

  constructor(
    readonly id: string,
    private area: RecordArea = { width: 1920, height: 1080 },
  ) {
    mkdirSync(RAW_DIR, { recursive: true });
    mkdirSync(CLIPS_DIR, { recursive: true });
    mkdirSync(STILLS_DIR, { recursive: true });
    this.raw = join(RAW_DIR, `${id}.mkv`);
  }

  async start(): Promise<void> {
    if (existsSync(this.raw)) rmSync(this.raw);
    const a = this.area;
    const args = [
      "-hide_banner", "-loglevel", "error", "-nostats", "-progress", "pipe:1",
      "-f", "x11grab", "-draw_mouse", "0",
      "-framerate", String(CAPTURE_FPS),
      "-video_size", `${a.width}x${a.height}`,
      "-i", `${a.display ?? DISPLAY}.0+${a.x ?? 0},${a.y ?? 0}`,
      "-vf", "format=yuv420p",
      "-fps_mode", "cfr", "-r", String(CAPTURE_FPS),
      "-c:v", "libx264", "-preset", "ultrafast", "-crf", "10", "-g", String(CAPTURE_FPS), "-an",
      this.raw,
    ];
    this.proc = spawn("ffmpeg", args, { stdio: ["pipe", "pipe", "pipe"] });
    this.proc.stderr!.on("data", (d: Buffer) => (this.stderrTail = (this.stderrTail + d.toString()).slice(-2000)));
    let first: (() => void) | null = null;
    const gotFrame = new Promise<void>((r) => (first = r));
    this.proc.stdout!.on("data", (d: Buffer) => {
      const text = d.toString();
      const dup = [...text.matchAll(/dup_frames=(\d+)/g)].pop();
      const drop = [...text.matchAll(/drop_frames=(\d+)/g)].pop();
      if (dup) this.dup = Number(dup[1]);
      if (drop) this.drop = Number(drop[1]);
      const m = [...text.matchAll(/frame=(\d+)/g)].pop();
      if (m) {
        this.frames = Number(m[1]);
        if (this.frames >= 1 && first) {
          this.t0 = Date.now();
          first();
          first = null;
        }
      }
    });
    await Promise.race([gotFrame, sleep(8000).then(() => { throw new Error(`ffmpeg produced no frame: ${this.stderrTail}`); })]);
    // t0 is when the first frame was reported (the encoder trails the grab by a few frames).
    this.t0 -= 120;
  }

  /** Seconds since recording began. */
  now(): number {
    return (Date.now() - this.t0) / 1000;
  }

  /** The clip begins here (call once the first clean frame is up). */
  markIn(offset = 0): void {
    this.inAt = this.now() + offset;
  }

  markOut(offset = 0): void {
    this.outAt = this.now() + offset;
  }

  /** Close the current span and hide everything until the next `markIn`. */
  cut(offset = 0): void {
    this.markOut(offset);
    this.spans.push([this.inAt, this.outAt!]);
    this.outAt = null;
  }

  async stop(): Promise<void> {
    const p = this.proc;
    if (!p) return;
    this.proc = null;
    await new Promise<void>((resolve) => {
      p.once("exit", () => resolve());
      p.stdin!.write("q");
    });
  }

  /** Trim + encode the delivery file; returns its path and duration. */
  finish(outPath = join(CLIPS_DIR, `${this.id}.mp4`)): { path: string; seconds: number } {
    mkdirSync(dirname(outPath), { recursive: true });
    const end = this.outAt ?? this.now();
    const spans: [number, number][] = [...this.spans, [this.inAt, end]];
    const parts = spans.map(([a, b], k) => `[0:v]trim=start=${a.toFixed(3)}:end=${b.toFixed(3)},setpts=PTS-STARTPTS[v${k}]`);
    const filter = parts.join(";") + (spans.length > 1 ? `;${spans.map((_, k) => `[v${k}]`).join("")}concat=n=${spans.length}:v=1:a=0[out]` : "");
    const map = spans.length > 1 ? "[out]" : "[v0]";
    const args = [
      "-hide_banner", "-loglevel", "error", "-y",
      "-i", this.raw,
      "-filter_complex", filter, "-map", map,
      "-an", "-c:v", "libx264", "-preset", "slow", "-crf", "15", "-pix_fmt", "yuv420p",
      "-r", String(FPS), "-movflags", "+faststart",
      outPath,
    ];
    execFileSync("ffmpeg", args, { stdio: "inherit" });
    console.log(`[${this.id}] capture: ${this.frames} frames, ${this.dup} duplicated (late), ${this.drop} dropped`);
    return { path: outPath, seconds: Number(spans.reduce((t, [a, b]) => t + (b - a), 0).toFixed(2)) };
  }
}

/** One still per clip, from the middle of the delivery file (or `at` seconds in). */
export function still(mp4: string, id: string, at?: number): string {
  const out = join(STILLS_DIR, `${id}.png`);
  const dur = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", mp4], { encoding: "utf8" }).trim());
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-ss", String(at ?? dur * 0.55), "-i", mp4, "-frames:v", "1", out]);
  return out;
}
