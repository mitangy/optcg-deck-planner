import { fetchThread, listThreads, type ChatContext, type ChatRequest, type ThreadHistory } from "./client";
import { GENERAL, SCOPE_TITLE_MAX, type LogPoseScope } from "./scopes";

export function chatBody(message: string, threadId: number | null, scope: LogPoseScope, context?: ChatContext): ChatRequest {
  const body: ChatRequest = { message };
  if (threadId) body.thread_id = threadId;
  else if (scope.key !== GENERAL) {
    body.scope = scope.key;
    if (scope.title) body.scope_title = scope.title.slice(0, SCOPE_TITLE_MAX);
  }
  if (context) body.context = context;
  return body;
}

export type ScopeChat = { id: number; thread: ThreadHistory } | null;

export async function resolveScopeChat(
  apiBase: string,
  scope: string,
  hint: number | null,
  opts: { early?: (chat: NonNullable<ScopeChat>) => void; stale?: (id: number) => void; fetchImpl?: typeof fetch } = {},
): Promise<ScopeChat> {
  const f = opts.fetchImpl ?? fetch;
  type Hinted = { thread: ThreadHistory | null; failed: boolean };
  const hinted: Promise<Hinted> = hint
    ? fetchThread(apiBase, hint, f).then(
        (thread): Hinted => {
          if (thread) opts.early?.({ id: hint, thread });
          return { thread, failed: false };
        },
        (): Hinted => ({ thread: null, failed: true }),
      )
    : Promise.resolve({ thread: null, failed: false });
  const rows = await listThreads(apiBase, scope, f).catch(() => null);
  const mine = await hinted;
  const newest = rows?.[0]?.id ?? null;
  // A hint the server no longer has (404) is forgotten; one that merely failed to load is kept.
  if (hint && !mine.thread && !mine.failed) opts.stale?.(hint);
  if (newest !== null && newest !== hint) {
    const thread = await fetchThread(apiBase, newest, f);
    if (thread) return { id: newest, thread };
  }
  if (hint && mine.thread) return { id: hint, thread: mine.thread };
  if (mine.failed) throw new Error("Could not load your last chat.");
  return null;
}
