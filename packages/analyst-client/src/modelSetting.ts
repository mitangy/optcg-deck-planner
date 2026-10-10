/** The model Log Pose runs on: one global setting on the planner API, the same in both apps; only its admin can change it. */

export type ModelSetting = { model: string; options: string[]; canEdit: boolean };

const FAILED = "Something went wrong. Try again in a moment.";

/** The label a model id is shown with ("claude-opus-5-5" is "Opus 5.5"). */
export function modelLabel(id: string): string {
  const m = /^claude-([a-z]+)-(\d+)-(\d+)$/.exec(id);
  return m ? `${m[1]![0]!.toUpperCase()}${m[1]!.slice(1)} ${m[2]}.${m[3]}` : id;
}

/** What the selected model costs next to the default, Sonnet; the picker's note. */
export function modelCostHint(id: string): string {
  switch (id) {
    case "claude-sonnet-5-5":
      return "Default.";
    case "claude-opus-5-5":
      return "Costs about 2x Sonnet.";
    case "claude-haiku-5-5":
      return "Costs about 1/20 of Sonnet.";
    case "claude-haiku-4-5":
      return "Costs about half of Sonnet.";
    default:
      return "";
  }
}

function parse(raw: unknown): ModelSetting | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.model !== "string" || !Array.isArray(r.options)) return null;
  const options = r.options.filter((o): o is string => typeof o === "string");
  return { model: r.model, options, canEdit: r.can_edit === true };
}

async function call(apiBase: string, init: RequestInit, fetchImpl: typeof fetch): Promise<ModelSetting> {
  let res: Response;
  try {
    res = await fetchImpl(`${apiBase}/analyst/settings/model`, { credentials: "include", ...init });
  } catch {
    throw new Error(FAILED);
  }
  if (!res.ok) {
    let detail = FAILED;
    try {
      const body = (await res.json()) as { detail?: unknown };
      if (typeof body.detail === "string" && body.detail.trim()) detail = body.detail.trim().slice(0, 300);
    } catch {
      /* not JSON */
    }
    throw new Error(detail);
  }
  const setting = parse(await res.json());
  if (!setting) throw new Error(FAILED);
  return setting;
}

/** GET /analyst/settings/model. */
export const getModelSetting = (apiBase: string, fetchImpl: typeof fetch = fetch) => call(apiBase, {}, fetchImpl);

/** PUT /analyst/settings/model (admin only); resolves to the saved setting. */
export const setModelSetting = (apiBase: string, model: string, fetchImpl: typeof fetch = fetch) =>
  call(apiBase, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model }) }, fetchImpl);
