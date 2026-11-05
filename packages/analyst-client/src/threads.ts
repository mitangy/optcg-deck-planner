import { fetchThread, listThreads, type ChatContext, type ChatRequest, type ThreadHistory } from "./client";
import { GENERAL, SCOPE_TITLE_MAX, type LogPoseScope } from "./scopes";

/**
 * The body of a chat message. An open thread carries its id; a new chat carries the scope it belongs to (the
 * server ignores the scope once a thread exists). The general chat sends no scope.
 */
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

/**
 * The chat to show for a scope: the newest one the server lists for it (so a chat started on another device is
 * found), or the remembered `hint` when the list can't be read. The hint is fetched at the same time as the list,
 * so a chat remembered here shows without waiting; `early` hears of it first. Null when the scope has no chat.
 */
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
