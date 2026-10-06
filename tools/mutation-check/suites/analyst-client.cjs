/** analyst-client mutations (packages/analyst-client/src, vitest): the Log Pose chat client shared by duel-web and the planner. */
const sse = "packages/analyst-client/src/sse.ts";
const client = "packages/analyst-client/src/client.ts";
const session = "packages/analyst-client/src/session.ts";
const md = "packages/analyst-client/src/markdown.ts";
module.exports = {
  cwd: "packages/analyst-client",
  runner: "vitest",
  mutations: [
    // SSE parser
    { id: "sse-drops-partial-line", file: sse, from: "      buf = buf.slice(start);", to: "      buf = \"\";", kills: ["parses the same events wherever the stream is split", "parses a stream fed one character at a time"] },
    { id: "sse-crlf-not-held", file: sse, from: "        if (c === \"\\r\" && i === buf.length - 1) break;\n", to: "", kills: ["including a \\r\\n split between chunks"] },
    { id: "sse-decode-not-streaming", file: sse, from: "parser.push(decoder.decode(value, { stream: true }));", to: "parser.push(decoder.decode(value));", kills: ["decodes a UTF-8 character whose bytes are split"] },
    // Chat client
    { id: "client-no-401-retry", file: client, from: "      if (e.status === 401 && attempt === 0) continue;\n", to: "", kills: ["refreshes the session and retries once when the analyst answers 401"] },
    { id: "client-second-401-swallowed", file: client, from: "      if (e.status === 401 && attempt === 0) continue;", to: "      if (e.status === 401) continue;", kills: ["gives up with an auth error after a second 401"] },
    { id: "client-retry-keeps-token", file: client, from: "    const auth = await session.getAuth(attempt > 0);", to: "    const auth = await session.getAuth();", kills: ["refreshes the session and retries once when the analyst answers 401"] },
    { id: "client-429-generic", file: client, from: "      if (e.status === 429) throw new AnalystError(\"budget\", BUDGET_MESSAGE);\n", to: "", kills: ["turns a 429 into the daily-limit message"] },
    { id: "client-budget-code-ignored", file: client, from: "  if (err.code === \"budget\") return BUDGET_MESSAGE;\n", to: "", kills: ["shows the daily-limit message for an in-stream budget error"] },
    { id: "client-refusal-reason-hidden", file: client, from: "      throw new AnalystError(\"server\", refusalReason(e.body) ?? GENERIC_ERROR);", to: "      throw new AnalystError(\"server\", GENERIC_ERROR);", kills: ["shows the analyst's own reason when it refuses before streaming"] },
    { id: "client-refusal-any-body", file: client, from: "    return typeof parsed.error === \"string\" && parsed.error.trim() ? parsed.error.trim().slice(0, 300) : null;\n  } catch {\n    return null;", to: "    return typeof parsed.error === \"string\" && parsed.error.trim() ? parsed.error.trim().slice(0, 300) : null;\n  } catch {\n    return body;", kills: ["shows the analyst's own reason when it refuses before streaming"] },
    { id: "client-status-as-text", file: client, from: "else if (event === \"status\" && typeof d.text === \"string\") handlers.onStatus?.(d.text);", to: "else if (event === \"status\" && typeof d.text === \"string\") handlers.onText?.(d.text);", kills: ["hands thread, status, text and done events to their handlers in order"] },
    // Session token
    { id: "session-no-margin", file: session, from: "  return at - now < REFRESH_MARGIN_MS;", to: "  return at - now < 0;", kills: ["refreshes a token with less than 2 minutes left", "mints a new token before a request when the current one is about to expire"] },
    { id: "session-margin-too-wide", file: session, from: "export const REFRESH_MARGIN_MS = 2 * 60 * 1000;", to: "export const REFRESH_MARGIN_MS = 3 * 60 * 1000;", kills: ["refreshes a token with less than 2 minutes left and keeps one with more"] },
    // Markdown
    { id: "md-any-scheme-link", file: md, from: "  return url.protocol === \"http:\" || url.protocol === \"https:\" ? url.href : null;", to: "  return url.href;", kills: ["does not turn javascript: or data: links into links"] },
    { id: "md-no-bold", file: md, from: "        out.push({ t: \"b\", c: parseInline(s.slice(i + 2, j)) });", to: "        out.push({ t: \"i\", c: parseInline(s.slice(i + 2, j)) });", kills: ["parses bold, italic and inline code", "parses a pipe table"] },
    { id: "md-underscore-italic-anywhere", edits: [
      { file: md, from: "      const opens = ch === \"*\" || i === 0 || /[\\s(]/.test(s[i - 1]!);", to: "      const opens = true;" },
      { file: md, from: "      if (j > 0 && (ch === \"*\" || j + 1 >= s.length || !/\\w/.test(s[j + 1]!))) {", to: "      if (j > 0) {" },
    ], kills: ["leaving snake_case and code contents alone"] },
    { id: "md-no-tables", file: md, from: "    if (isTableStart(lines, i)) {\n      const head", to: "    if (false) {\n      const head", kills: ["parses a pipe table with its header and rows"] },
    { id: "md-ol-start-ignored", file: md, from: "{ t: \"ol\", start: Number(numbered![1]), items: parsed }", to: "{ t: \"ol\", start: 1, items: parsed }", kills: ["keeping the numbered list's start"] },
    { id: "md-list-continuation-dropped", file: md, from: "          items[items.length - 1]!.push(l);\n", to: "", kills: ["parses bullet and numbered lists"] },
    { id: "md-fence-parsed", file: md, from: "    const fence = FENCE.exec(line);", to: "    const fence = null as RegExpExecArray | null;", kills: ["keeps a fenced code block verbatim"] },
  ],
};
