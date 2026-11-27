import { afterEach, describe, expect, it, vi } from "vitest";
import { updateIgReel, uploadIgReel } from "./adminApi";

afterEach(() => vi.unstubAllGlobals());

function stubFetch() {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: 1 }), { status: 200, headers: { "Content-Type": "application/json" } }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("Instagram reel calls (#1482)", () => {
  it("uploads the video, title and caption as multipart form fields the server reads by name", async () => {
    const fetchMock = stubFetch();
    const file = new File([new Uint8Array([0, 0, 0, 24])], "t.mp4", { type: "video/mp4" });
    await uploadIgReel(file, "Trailer", "Hello");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/admin/instagram/reels");
    expect(init.method).toBe("POST");
    const form = init.body as FormData;
    expect([form.get("title"), form.get("caption")]).toEqual(["Trailer", "Hello"]);
    expect((form.get("file") as File).name).toBe("t.mp4");
  });

  it("patches only the fields given", async () => {
    const fetchMock = stubFetch();
    await updateIgReel(4, { active: false });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("/admin/instagram/reels/4");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({ active: false });
  });
});
