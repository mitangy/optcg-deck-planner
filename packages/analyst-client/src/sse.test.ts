import { describe, expect, it } from "vitest";
import { createSseParser, streamSse, type SseEvent } from "./sse";

const STREAM =
  'event: thread\r\ndata: {"thread_id":12}\r\n\r\n' +
  ": keep-alive\n\n" +
  'event: status\ndata: {"text":"Searching recent Enel games…"}\n\n' +
  'event: text\ndata: {"delta":"Hello"}\n\n' +
  'event: text\ndata: {"delta":" world"}\n\n' +
  'event: done\ndata: {"thread_id":12,"cost_usd":0.01}\n\n';

const EXPECTED: SseEvent[] = [
  { event: "thread", data: { thread_id: 12 } },
  { event: "status", data: { text: "Searching recent Enel games…" } },
  { event: "text", data: { delta: "Hello" } },
  { event: "text", data: { delta: " world" } },
  { event: "done", data: { thread_id: 12, cost_usd: 0.01 } },
];

function parseInChunks(chunks: string[]): SseEvent[] {
  const out: SseEvent[] = [];
  const p = createSseParser((e) => out.push(e));
  for (const c of chunks) p.push(c);
  p.end();
  return out;
}

function bodyOf(parts: Uint8Array[]): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(ctrl) {
      for (const p of parts) ctrl.enqueue(p);
      ctrl.close();
    },
  });
  return new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

describe("SSE parser (#377)", () => {
  it("parses the same events wherever the stream is split into two chunks (#377)", () => {
    for (let cut = 0; cut <= STREAM.length; cut++) {
      expect(parseInChunks([STREAM.slice(0, cut), STREAM.slice(cut)]), `split at ${cut}`).toEqual(EXPECTED);
    }
  });

  it("parses a stream fed one character at a time, including a \\r\\n split between chunks (#377)", () => {
    expect(parseInChunks([...STREAM])).toEqual(EXPECTED);
  });

  it("decodes a UTF-8 character whose bytes are split across network chunks (#377)", async () => {
    const bytes = new TextEncoder().encode('event: text\ndata: {"delta":"Nami’s Clima-Tact"}\n\n');
    const at = bytes.indexOf(0xe2) + 1; // inside the 3-byte apostrophe
    const events: SseEvent[] = [];
    await streamSse("https://x/chat", { method: "POST" }, (e) => events.push(e), async () =>
      bodyOf([bytes.slice(0, at), bytes.slice(at)]),
    );
    expect(events).toEqual([{ event: "text", data: { delta: "Nami’s Clima-Tact" } }]);
  });
});
