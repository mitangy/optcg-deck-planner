import { describe, expect, it } from "vitest";
import { encodeEmbeddings } from "./cardEmbed";
import { attachEmbeddings, isCurrent, type EmbedderPointer } from "./cardEmbedCache";
import type { ScanCandidate } from "./cardScanMatch";

const pointer: EmbedderPointer = {
  formatVersion: "embed-v1",
  model: { file: "card-embedder-aaaa.onnx", hash: "aaaa", bytes: 10 },
  embeddings: { file: "embeddings-bbbb.bin", hash: "bbbb", bytes: 20, count: 2, dim: 4 },
};
const stored = (over: { model?: number; embeddings?: number; pointer?: EmbedderPointer } = {}) => ({
  pointer: over.pointer ?? pointer,
  model: new ArrayBuffer(over.model ?? 10),
  embeddings: new ArrayBuffer(over.embeddings ?? 20),
});

describe("isCurrent", () => {
  it("accepts a stored bundle that is exactly what the pointer names (#701)", () => {
    expect(isCurrent(stored(), pointer)).toBe(true);
  });

  it("re-downloads when nothing is stored (#701)", () => {
    expect(isCurrent(null, pointer)).toBe(false);
  });

  it("re-downloads when the model was retrained (#701)", () => {
    const next = { ...pointer, model: { ...pointer.model, file: "card-embedder-cccc.onnx" } };
    expect(isCurrent(stored(), next)).toBe(false);
  });

  it("re-downloads when the embeddings were regenerated for new printings (#701)", () => {
    const next = { ...pointer, embeddings: { ...pointer.embeddings, file: "embeddings-dddd.bin" } };
    expect(isCurrent(stored(), next)).toBe(false);
  });

  it("re-downloads a truncated copy of either file (#701)", () => {
    expect(isCurrent(stored({ model: 9 }), pointer)).toBe(false);
    expect(isCurrent(stored({ embeddings: 19 }), pointer)).toBe(false);
  });
});

describe("attachEmbeddings", () => {
  const cand = (label: string) => ({ cardId: label.split("__")[0], label }) as ScanCandidate;

  it("joins rows to candidates by printing label and reports how many matched (#701)", () => {
    const bytes = encodeEmbeddings(["OP01-001__1", "OP01-001__2"], [Int8Array.from([1, 2, 3, 4]), Int8Array.from([5, 6, 7, 8])], 4);
    const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const cands = [cand("OP01-001__2"), cand("OP01-001__1"), cand("NEW-001__9")];
    expect(attachEmbeddings(cands, buf)).toBe(2);
    expect(Array.from(cands[0].embedding!)).toEqual([5, 6, 7, 8]);
    expect(Array.from(cands[1].embedding!)).toEqual([1, 2, 3, 4]);
    // A printing newer than the embeddings keeps none and is ordered by hash alone.
    expect(cands[2].embedding).toBeUndefined();
  });
});
