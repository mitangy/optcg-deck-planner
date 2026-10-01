import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@colyseus/sdk", () => ({ Client: class {} }));

import { EffectOrderPrompt } from "../board/EffectOrderPrompt";
import { ChoicePrompt } from "../board/ChoicePrompt";
import { floatLookAnswer } from "../board/floatOrder";
import { lookupCard } from "../cards/atlas";
import { PROTOCOL_VERSION as CONFIG_PROTOCOL_VERSION } from "../config";
import { DuelClient } from "./duelClient";
import { PROTOCOL_VERSION, intentLabel, parseView, parseWelcome, type ChoiceRequestView, type Intent, type PendingChoiceView, type PlayerView } from "./protocol";

// Golden fixtures generated from the engine (packages/rules/protocol-fixtures);
// game-server and duel-web run their own contract tests against the same files.
const dir = fileURLToPath(new URL("../../../packages/rules/protocol-fixtures/", import.meta.url));
const load = <T,>(file: string): T => JSON.parse(readFileSync(`${dir}${file}`, "utf8")) as T;

type ServerFixture = { name: string; message: string; viewerSeat: 0 | 1; choice: string | null; answerable: boolean; body: { view: PlayerView } & Record<string, unknown> };
type ClientFixture = { name: string; intentType: string; answers: string | null; body: { protocolVersion: number; intent: Intent } };

const server = load<ServerFixture[]>("server-messages.json");
const client = load<ClientFixture[]>("client-messages.json");
const serverFixture = (name: string) => server.find((f) => f.name === name)!;
const clientFixture = (name: string) => client.find((f) => f.name === name)!;
const front = (f: ServerFixture) => f.body.view.pendingChoices![0]!;

/** Text nodes of the rendered prompt, in order. */
function texts(element: React.ReactElement): string[] {
  const html = renderToStaticMarkup(element);
  return [...html.matchAll(/>([^<>]+)</g)].map((m) => m[1]!.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"));
}

function optionName(o: { label?: string; defId?: string }): string {
  return o.label ?? (!o.defId || o.defId === "HIDDEN" ? "Hidden card" : lookupCard(o.defId).name);
}

describe("protocol contract (golden fixtures)", () => {
  it("speaks the protocol version the fixtures were generated for, when parsing and when sending", () => {
    const version = load<{ protocolVersion: number }>("protocol.json").protocolVersion;
    expect(PROTOCOL_VERSION).toBe(version);
    // net/duelClient.ts stamps every outgoing message with the config constant.
    expect(CONFIG_PROTOCOL_VERSION).toBe(version);
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
      const choice = front(f) as unknown as PendingChoiceView;
      const request = choice.request;
      if (f.choice === "order_effects") {
        const rendered = texts(<EffectOrderPrompt choice={choice} onSend={() => {}} />);
        expect(rendered).toContain("Order simultaneous effects");
        for (const effect of choice.unorderedChoices!) {
          expect(rendered.filter((t) => t === effect.prompt)).toHaveLength(choice.unorderedChoices!.filter((e) => e.prompt === effect.prompt).length);
        }
        return;
      }
      const rendered = texts(<ChoicePrompt choice={choice} mySeat={f.viewerSeat} onSend={() => {}} />);
      expect(rendered).toContain(choice.prompt);
      const type = f.choice === "life_trigger" ? "confirm" : request!.type;
      if (type === "confirm") {
        expect(rendered).toContain(f.choice === "life_trigger" ? "Activate Trigger" : "Yes");
        expect(rendered.includes(f.choice === "life_trigger" ? "Add to hand" : "No")).toBe(choice.optional);
      } else if (request!.type === "mode") {
        expect(rendered.filter((t) => request!.options.some((o) => o.label === t))).toEqual(request!.options.map((o) => o.label));
      } else if (request!.type === "order") {
        for (const o of request!.options) expect(rendered).toContain(optionName(o));
        expect(rendered).toContain("Confirm order");
      } else if (request!.type === "select") {
        expect(rendered.some((t) => t.startsWith("Choose "))).toBe(true);
        for (const o of request!.options) expect(rendered).toContain(optionName(o));
      } else if (request!.type === "look") {
        expect(rendered.some((t) => t.endsWith("selected 0"))).toBe(true);
        for (const o of request!.options) expect(rendered).toContain(optionName(o));
      }
    });
  });

  describe("answers", () => {
    it("builds the look answer the fixture sends", () => {
      const request = front(serverFixture("choice-look")).request as unknown as Extract<ChoiceRequestView, { type: "look" }>;
      const { intent } = clientFixture("resolve-look").body;
      const answer = floatLookAnswer(request, request.options.map((o) => o.id), intent.selectedOptionIds as string[], "bottom");
      expect({ type: "resolve_pending_choice", accept: true, ...answer }).toEqual(intent);
    });
  });
});
