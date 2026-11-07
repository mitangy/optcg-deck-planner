import { toCitation } from "./citations";
import type { Block, CallModel, Usage } from "./types";

/** The Claude API behind CallModel: a streamed Messages call. */
export function anthropicModel(client: { beta: { messages: { stream: (p: never, o: { signal: AbortSignal }) => StreamLike } } }): CallModel {
  return async (params, onText, signal, onCite) => {
    const stream = client.beta.messages.stream(params as never, { signal });
    stream.on("text", onText);
    stream.on("citation", (citation) => {
      const c = toCitation(citation);
      if (c) onCite?.(c);
    });
    // What the stream has used so far, kept as it arrives: a stream that fails or is aborted never reaches finalMessage's usage.
    let used: Usage = { input_tokens: 0, output_tokens: 0 };
    stream.on("streamEvent", (_event, snapshot) => {
      used = { ...snapshot.usage };
    });
    let msg: Awaited<ReturnType<StreamLike["finalMessage"]>>;
    try {
      msg = await stream.finalMessage();
    } catch (err) {
      throw Object.assign(err instanceof Error ? err : new Error(String(err)), { partialUsage: used });
    }
    return { content: msg.content as unknown as Block[], stop_reason: msg.stop_reason, usage: msg.usage, model: msg.model };
  };
}

type StreamLike = {
  on: ((event: "text", cb: (delta: string) => void) => unknown) &
    ((event: "citation", cb: (citation: unknown) => void) => unknown) &
    ((event: "streamEvent", cb: (event: unknown, snapshot: { usage: Usage }) => void) => unknown);
  finalMessage: () => Promise<{ content: unknown; stop_reason: string | null; usage: Usage; model?: string }>;
};
