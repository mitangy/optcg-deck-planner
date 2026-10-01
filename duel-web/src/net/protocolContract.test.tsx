import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// Card art reads saved art prefs; server rendering has no storage.
vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {} });
vi.mock("@colyseus/sdk", () => ({ Client: class {} }));

const { PROTOCOL_VERSION, intentLabel, parseView, parseWelcome } = await import("./protocol");
const { DuelClient } = await import("./duelClient");
const { ChoicePrompt } = await import("../board/ChoicePrompt");
const { EffectOrderPrompt } = await import("../board/EffectOrderPrompt");
const { arrangementAnswer, initialArrangement, setSide } = await import("../board/deckOrder");
const { floatLookAnswer } = await import("../board/floatOrder");
const { splitPrimaryIntent } = await import("../board/primaryIntent");
import type { ChoiceRequestView, Intent, PendingChoiceView, PlayerView } from "./protocol";

// Golden fixtures generated from the engine (packages/rules/protocol-fixtures);
// game-server and mobile run their own contract tests against the same files.
const dir = fileURLToPath(new URL("../../../packages/rules/protocol-fixtures/", import.meta.url));
const load = <T,>(file: string): T => JSON.parse(readFileSync(`${dir}${file}`, "utf8")) as T;

type ServerFixture = { name: string; message: string; viewerSeat: 0 | 1; choice: string | null; answerable: boolean; body: { view: PlayerView } & Record<string, unknown> };
type ClientFixture = { name: string; intentType: string; answers: string | null; body: { protocolVersion: number; intent: Intent } };

const server = load<ServerFixture[]>("server-messages.json");
const client = load<ClientFixture[]>("client-messages.json");
const serverFixture = (name: string) => server.find((f) => f.name === name)!;
const clientFixture = (name: string) => client.find((f) => f.name === name)!;
const front = (f: ServerFixture) => f.body.view.pendingChoices![0]!;
const count = (html: string, re: RegExp) => html.match(re)?.length ?? 0;
const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/'/g, "&#x27;").replace(/"/g, "&quot;");

describe("protocol contract (golden fixtures)", () => {
  it("speaks the protocol version the fixtures were generated for", () => {
    expect(PROTOCOL_VERSION).toBe(load<{ protocolVersion: number }>("protocol.json").protocolVersion);
  });

  it("parses every server view and welcome fixture, keeping the pending choices", () => {
    for (const f of server) {
      const parsed = f.message === "welcome" ? parseWelcome(f.body) : parseView(f.body);
      expect(parsed.view.pendingChoices, f.name).toEqual(f.body.view.pendingChoices);
      expect(parsed.view.legalIntents, f.name).toEqual(f.body.view.legalIntents);
    }
  });

  it("refuses a private look whose cards are readable by the other seat", () => {
    const f = serverFixture("choice-look-opponent");
    expect(() => parseView(f.body)).not.toThrow();
    const leaked = structuredClone(f.body) as typeof f.body;
    (leaked.view.pendingChoices![0]!.request as Extract<ChoiceRequestView, { type: "look" }>).options[0]!.defId = "OP01-013";
    expect(() => parseView(leaked)).toThrow(/privacy leak/);
  });

  it("labels every client intent fixture by name instead of falling through to its type", () => {
    for (const f of client) {
      const owner = server.find((s) => s.name === f.answers)?.body.view;
      expect(intentLabel(f.body.intent, owner), f.name).not.toBe(f.body.intent.type);
    }
  });

  it("never offers a choice answer as the primary action", () => {
    for (const f of server.filter((s) => s.choice && s.answerable)) {
      expect(splitPrimaryIntent(f.body.view.legalIntents).primary, f.name).toBeNull();
    }
  });

  it("sends each intent fixture to the server as the fixture envelope", () => {
    const sent: unknown[][] = [];
    const duel = new DuelClient();
    (duel as unknown as { room: unknown }).room = { send: (...args: unknown[]) => sent.push(args) };
    for (const f of client) duel.sendIntent(f.body.intent);
    expect(sent).toEqual(client.map((f) => ["intent", f.body]));
  });

  describe("choice prompts", () => {
    const answerable = server.filter((f) => f.choice && f.answerable && f.name !== "welcome");

    it.each(answerable.map((f) => [f.name, f] as const))("%s renders its prompt, not a fallback", (_name, f) => {
      const choice: PendingChoiceView = front(f);
      const request = choice.request;
      if (f.choice === "order_effects") {
        const html = renderToStaticMarkup(<EffectOrderPrompt choice={choice} onSend={() => {}} />);
        expect(count(html, /class="effect-order-item"/g)).toBe(choice.unorderedChoices!.length);
        for (const effect of choice.unorderedChoices!) expect(html).toContain(escapeHtml(effect.prompt));
        return;
      }
      const html = renderToStaticMarkup(<ChoicePrompt choice={choice} mySeat={f.viewerSeat} onSend={() => {}} view={f.body.view} />);
      // A life trigger is a yes/no question; every other kind is named by its request.
      const type = f.choice === "life_trigger" ? "confirm" : request!.type;
      expect(html).toContain(`choice-prompt choice-${type}"`);
      if (type === "confirm") {
        expect(html).toContain(f.choice === "life_trigger" ? "Activate Trigger" : "Yes");
        expect(html.includes(f.choice === "life_trigger" ? "Add to hand" : ">No<")).toBe(choice.optional);
      } else if (request!.type === "mode") {
        expect(count(html, /class="btn btn-secondary choice-mode"/g)).toBe(request!.options.length);
      } else if (request!.type === "order") {
        expect(count(html, /choice-order-name/g)).toBe(request!.options.length);
      } else {
        // select / look: one card (or chip) per option.
        expect(count(html, /class="choice-option(?: selected| disabled)*"|ability-chip choice-chip/g)).toBe(request!.options.length);
      }
    });

    it("covers every choice kind the engine can raise", () => {
      expect(new Set(answerable.map((f) => f.choice))).toEqual(new Set(["confirm", "select", "mode", "order", "look", "order_effects", "life_trigger"]));
    });
  });

  describe("answers", () => {
    it("builds the look answer the fixture sends", () => {
      const request = front(serverFixture("choice-look")).request as Extract<ChoiceRequestView, { type: "look" }>;
      const { intent } = clientFixture("resolve-look").body;
      const answer = floatLookAnswer(request, request.options.map((o) => o.id), intent.selectedOptionIds as string[], "bottom");
      expect({ type: "resolve_pending_choice", accept: true, ...answer }).toEqual(intent);
    });

    it("builds the order answer the fixture sends", () => {
      const request = front(serverFixture("choice-order")).request as Extract<ChoiceRequestView, { type: "order" }>;
      const { intent } = clientFixture("resolve-order").body;
      const bottom = setSide(initialArrangement(request.options.map((o) => o.id)), request.options[0]!.id, "bottom");
      expect({ type: "resolve_pending_choice", accept: true, ...arrangementAnswer(bottom) }).toEqual(intent);
    });
  });
});
