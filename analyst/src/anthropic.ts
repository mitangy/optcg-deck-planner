import type Anthropic from "@anthropic-ai/sdk";
import { toCitation } from "./citations";
import type { Block, CallModel, Usage } from "./types";

/** The SDK's own request type for a streamed Messages call. */
type StreamParams = Parameters<Anthropic["beta"]["messages"]["stream"]>[0];

/**
 * The Claude API behind CallModel: a streamed Messages call. `params` is built loosely in the tool loop (blocks
 * are plain records so stored threads and scripted test replies fit), so it is cast to the SDK's type here, at the
 * one place it meets the SDK.
 */
export function anthropicModel(client: Pick<Anthropic, "beta">): CallModel {
  return async (params, onText, signal, onCite) => {
    const stream = client.beta.messages.stream(params as unknown as StreamParams, { signal });
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
    let msg: Awaited<ReturnType<typeof stream.finalMessage>>;
    try {
      msg = await stream.finalMessage();
    } catch (err) {
      throw Object.assign(err instanceof Error ? err : new Error(String(err)), { partialUsage: used });
    }
    return { content: msg.content as unknown as Block[], stop_reason: msg.stop_reason, usage: msg.usage, model: msg.model };
  };
}
