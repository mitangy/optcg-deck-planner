import { describe, expect, it } from "vitest";
import { getModelSetting, modelCostHint, modelLabel, setModelSetting } from "./modelSetting";

function reply(body: unknown, status = 200) {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = (async (url: string | URL | Request, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    return Response.json(body, { status });
  }) as typeof fetch;
  return { impl, calls };
}

describe("Log Pose model setting (#428)", () => {
  it("reads who may edit it from can_edit, and shows model ids as names (#428)", async () => {
    const body = { model: "claude-opus-5-5", options: ["claude-sonnet-5-5", "claude-opus-5-5"], can_edit: true };
    expect(await getModelSetting("/api", reply(body).impl)).toEqual({ model: "claude-opus-5-5", options: body.options, canEdit: true });
    expect((await getModelSetting("/api", reply({ ...body, can_edit: "yes" }).impl)).canEdit).toBe(false);
    expect(modelLabel("claude-sonnet-5-5")).toBe("Sonnet 5.5");
    expect(modelLabel("claude-opus-5-5")).toBe("Opus 5.5");
    expect(modelLabel("claude-haiku-5-5")).toBe("Haiku 5.5");
    expect(modelLabel("claude-haiku-4-5")).toBe("Haiku 4.5");
  });

  it("tells the admin what the chosen model costs next to Sonnet, and nothing for an unknown one (#430)", () => {
    expect(modelCostHint("claude-opus-5-5")).toMatch(/2x Sonnet/);
    expect(modelCostHint("claude-haiku-5-5")).toMatch(/1\/20 of Sonnet/);
    expect(modelCostHint("claude-haiku-4-5")).toMatch(/half of Sonnet/);
    expect(modelCostHint("claude-sonnet-5-5")).toBe("Default.");
    expect(modelCostHint("gpt-5")).toBe("");
  });

  it("saves with PUT and the cookie, and surfaces the server's refusal (#428)", async () => {
    const ok = reply({ model: "claude-sonnet-5-5", options: [], can_edit: true });
    await setModelSetting("/api", "claude-sonnet-5-5", ok.impl);
    expect(ok.calls[0]!.url).toBe("/api/analyst/settings/model");
    expect(ok.calls[0]!.init).toMatchObject({ method: "PUT", credentials: "include", body: JSON.stringify({ model: "claude-sonnet-5-5" }) });
    await expect(setModelSetting("/api", "x", reply({ detail: "Only the Log Pose model admin can change the model" }, 403).impl)).rejects.toThrow(/model admin/);
  });
});
