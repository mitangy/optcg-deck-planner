import type { AttackTarget, Intent } from "../types.js";

export type ParseIntentErrorCode = "BAD_INTENT" | "UNKNOWN_INTENT";

export type ParseIntentResult =
  | { ok: true; intent: Intent }
  | { ok: false; code: ParseIntentErrorCode; message: string };

type Fail = { ok: false; code: ParseIntentErrorCode; message: string };
type Field<T> = { ok: true; value: T } | Fail;

const bad = (message: string): Fail => ({ ok: false, code: "BAD_INTENT", message });

type Obj = Record<string, unknown>;

function index(o: Obj, key: string): Field<number> {
  const v = o[key];
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v < 0) {
    return bad(`${key} must be a non-negative integer`);
  }
  return { ok: true, value: v };
}

function id(o: Obj, key: string): Field<string> {
  const v = o[key];
  if (typeof v !== "string" || v.length === 0) return bad(`${key} must be a non-empty string`);
  return { ok: true, value: v };
}

function bool(o: Obj, key: string): Field<boolean> {
  const v = o[key];
  if (typeof v !== "boolean") return bad(`${key} must be a boolean`);
  return { ok: true, value: v };
}

/** Optional id: absent (undefined/null) is fine, anything else must be a non-empty string. */
function optId(o: Obj, key: string): Field<string | undefined> {
  if (o[key] === undefined || o[key] === null) return { ok: true, value: undefined };
  return id(o, key);
}

function idList(o: Obj, key: string): Field<string[]> {
  const v = o[key];
  if (!Array.isArray(v) || v.some((x) => typeof x !== "string" || x.length === 0)) {
    return bad(`${key} must be an array of non-empty strings`);
  }
  return { ok: true, value: [...v] as string[] };
}

function optIdList(o: Obj, key: string): Field<string[] | undefined> {
  if (o[key] === undefined || o[key] === null) return { ok: true, value: undefined };
  return idList(o, key);
}

function attackTarget(o: Obj, key: string): Field<AttackTarget> {
  const v = o[key];
  if (!v || typeof v !== "object") return bad(`${key} must be an object`);
  const t = v as Obj;
  if (t.kind === "leader") return { ok: true, value: { kind: "leader" } };
  if (t.kind === "character") {
    const instanceId = id(t, "instanceId");
    if (!instanceId.ok) return bad(`${key}.instanceId must be a non-empty string`);
    return { ok: true, value: { kind: "character", instanceId: instanceId.value } };
  }
  return bad(`${key}.kind must be "leader" or "character"`);
}

/** Copy only the defined optional fields so a stripped intent never carries `undefined` keys. */
function withOptional<T extends object>(base: T, extra: Record<string, unknown>): T {
  const out = { ...base } as Record<string, unknown>;
  for (const [k, v] of Object.entries(extra)) if (v !== undefined) out[k] = v;
  return out as T;
}

/**
 * Validate an untrusted value (a client message) as an `Intent` before it reaches `applyIntent`,
 * which indexes arrays and reads fields without checking their types. Unknown extra fields are
 * stripped rather than rejected: the result is rebuilt from the validated fields only, so a client
 * that adds a field never reaches the engine with it and old/new clients stay compatible.
 */
export function parseIntent(raw: unknown): ParseIntentResult {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return bad("intent must be an object");
  }
  const o = raw as Obj;
  const type = o.type as Intent["type"] | undefined;
  const done = (intent: Intent): ParseIntentResult => ({ ok: true, intent });
  switch (type) {
    case "mulligan": {
      const doMulligan = bool(o, "doMulligan");
      return doMulligan.ok ? done({ type, doMulligan: doMulligan.value }) : doMulligan;
    }
    case "play_card": {
      const handIndex = index(o, "handIndex");
      if (!handIndex.ok) return handIndex;
      const trash = optId(o, "trashCharacterId");
      if (!trash.ok) return trash;
      return done(withOptional({ type, handIndex: handIndex.value }, { trashCharacterId: trash.value }));
    }
    case "give_don": {
      const donId = id(o, "donId");
      if (!donId.ok) return donId;
      const targetId = id(o, "targetId");
      if (!targetId.ok) return targetId;
      return done({ type, donId: donId.value, targetId: targetId.value });
    }
    case "activate_ability": {
      const sourceId = id(o, "sourceId");
      if (!sourceId.ok) return sourceId;
      const abilityId = id(o, "abilityId");
      if (!abilityId.ok) return abilityId;
      const targetId = optId(o, "targetId");
      if (!targetId.ok) return targetId;
      return done(withOptional({ type, sourceId: sourceId.value, abilityId: abilityId.value }, { targetId: targetId.value }));
    }
    case "declare_attack": {
      const attackerId = id(o, "attackerId");
      if (!attackerId.ok) return attackerId;
      const target = attackTarget(o, "target");
      if (!target.ok) return target;
      return done({ type, attackerId: attackerId.value, target: target.value });
    }
    case "declare_block": {
      const blockerId = id(o, "blockerId");
      return blockerId.ok ? done({ type, blockerId: blockerId.value }) : blockerId;
    }
    case "counter_from_hand":
    case "counter_event": {
      const handIndex = index(o, "handIndex");
      return handIndex.ok ? done({ type, handIndex: handIndex.value }) : handIndex;
    }
    case "resolve_pending_choice": {
      const accept = bool(o, "accept");
      if (!accept.ok) return accept;
      const selected = optIdList(o, "selectedOptionIds");
      if (!selected.ok) return selected;
      const ordered = optIdList(o, "orderedOptionIds");
      if (!ordered.ok) return ordered;
      const top = optIdList(o, "topOptionIds");
      if (!top.ok) return top;
      return done(
        withOptional(
          { type, accept: accept.value },
          { selectedOptionIds: selected.value, orderedOptionIds: ordered.value, topOptionIds: top.value },
        ),
      );
    }
    case "order_pending_effects": {
      const orderedIds = idList(o, "orderedIds");
      return orderedIds.ok ? done({ type, orderedIds: orderedIds.value }) : orderedIds;
    }
    case "pass_block":
    case "pass_counter":
    case "end_turn":
      return done({ type });
    default: {
      // Adding an Intent variant without a case above fails to compile here.
      const _exhaustive: undefined = type;
      void _exhaustive;
      return {
        ok: false,
        code: "UNKNOWN_INTENT",
        message: typeof o.type === "string" ? `Unknown intent type "${o.type.slice(0, 40)}"` : "Intent type must be a string",
      };
    }
  }
}
