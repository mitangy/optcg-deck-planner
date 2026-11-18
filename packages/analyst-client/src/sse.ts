export type SseEvent = { event: string; data: unknown };

export class SseHttpError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
  ) {
    super(`Stream request failed (${status})`);
    this.name = "SseHttpError";
  }
}

// A chunk may end in the middle of a line, a field or a `\r\n` pair.
export function createSseParser(onEvent: (e: SseEvent) => void) {
  let buf = "";
  let eventName = "";
  let dataLines: string[] = [];

  const dispatch = () => {
    if (dataLines.length) {
      const raw = dataLines.join("\n");
      let data: unknown = raw;
      try {
        data = JSON.parse(raw);
      } catch {
        /* plain text data */
      }
      onEvent({ event: eventName || "message", data });
    }
    eventName = "";
    dataLines = [];
  };

  const line = (l: string) => {
    if (l === "") return dispatch();
    if (l.startsWith(":")) return;
    const i = l.indexOf(":");
    const field = i < 0 ? l : l.slice(0, i);
    let value = i < 0 ? "" : l.slice(i + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event") eventName = value;
    else if (field === "data") dataLines.push(value);
  };

  return {
    push(chunk: string) {
      buf += chunk;
      let start = 0;
      for (let i = 0; i < buf.length; i++) {
        const c = buf[i];
        if (c !== "\n" && c !== "\r") continue;
        // A "\r" at the very end may be the first half of "\r\n": wait for the next chunk.
        if (c === "\r" && i === buf.length - 1) break;
        line(buf.slice(start, i));
        if (c === "\r" && buf[i + 1] === "\n") i++;
        start = i + 1;
      }
      buf = buf.slice(start);
    },
    end() {
      if (buf) line(buf.replace(/\r$/, ""));
      buf = "";
      dispatch();
    },
  };
}

export async function streamSse(
  url: string,
  init: RequestInit,
  onEvent: (e: SseEvent) => void,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const res = await fetchImpl(url, init);
  if (!res.ok) {
    let body = "";
    try {
      body = await res.text();
    } catch {
      /* no body */
    }
    throw new SseHttpError(res.status, body);
  }
  const parser = createSseParser(onEvent);
  if (!res.body) {
    parser.push(await res.text());
    parser.end();
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  try {
    for (;;) {
      if (init.signal?.aborted) throw new DOMException("The operation was aborted.", "AbortError");
      const { done, value } = await reader.read();
      if (done) break;
      parser.push(decoder.decode(value, { stream: true }));
    }
    parser.push(decoder.decode());
    parser.end();
  } catch (e) {
    await reader.cancel().catch(() => {});
    throw e;
  }
}
