import { describe, expect, it } from "vitest";
import { descriptorChunkFiles, type DescriptorManifest } from "./descriptorCache";

const manifest = (files: string[]): DescriptorManifest => ({
  formatVersion: "orb-f250-v1",
  features: 250,
  totalRecords: files.length,
  totalBytes: 0,
  chunks: files.map((file) => ({ file, hash: file, bytes: 0, records: [] })),
});

describe("descriptor upload check (#711)", () => {
  it("uploads the manifest's chunks and ignores the embedder's embeddings .bin beside them (#711)", () => {
    const m = manifest(["descriptors-aaa.bin", "descriptors-bbb.bin"]);
    const present = ["descriptors-aaa.bin", "descriptors-bbb.bin", "embeddings-ccc.bin", "descriptors.manifest.json"];
    expect(descriptorChunkFiles(m, present)).toEqual({ files: ["descriptors-aaa.bin", "descriptors-bbb.bin"], missing: [] });
  });

  it("reports a chunk the manifest lists but the folder lacks (#711)", () => {
    const m = manifest(["descriptors-aaa.bin", "descriptors-bbb.bin"]);
    expect(descriptorChunkFiles(m, ["descriptors-aaa.bin"]).missing).toEqual(["descriptors-bbb.bin"]);
  });
});
