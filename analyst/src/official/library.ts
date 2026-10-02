/**
 * Official rules material, read live from Bandai's site (en.onepiece-cardgame.com) and kept in memory:
 * comprehensive rules, FAQ rulings, errata and the ban list. Nothing is copied into the repo; a cache
 * entry is refreshed after `ttlMs`, and the last good copy is served if a refresh fails.
 */
import { parseBanList, type BanList } from "./banlist";
import { parseErrata, type Erratum } from "./errata";
import { pageLines, pdfPages } from "./pdf";
import { parseFaqIndex, parseQaTable, type QaEntry } from "./qa";
import { parseRules, type RulesDoc } from "./rules";

export const OFFICIAL_SITE = "https://en.onepiece-cardgame.com";

export type LibraryOptions = { baseUrl?: string; fetchImpl?: typeof fetch; ttlMs?: number; now?: () => Date };

export type FaqSet = { entries: QaEntry[]; general: QaEntry[]; files: number; failed: string[] };

type Slot<T> = { value?: T; at: number; pending?: Promise<T> };

export class OfficialLibrary {
  readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly ttlMs: number;
  private readonly now: () => Date;
  private readonly slots = new Map<string, Slot<unknown>>();

  constructor(opts: LibraryOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? OFFICIAL_SITE).replace(/\/$/, "");
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.ttlMs = opts.ttlMs ?? 12 * 60 * 60_000;
    this.now = opts.now ?? (() => new Date());
  }

  url(path: string) {
    return `${this.baseUrl}${path}`;
  }

  private cached<T>(key: string, load: () => Promise<T>): Promise<T> {
    const slot = (this.slots.get(key) ?? { at: 0 }) as Slot<T>;
    this.slots.set(key, slot as Slot<unknown>);
    const fresh = slot.value !== undefined && this.now().getTime() - slot.at < this.ttlMs;
    if (fresh) return Promise.resolve(slot.value!);
    if (!slot.pending) {
      slot.pending = load()
        .then((value) => {
          slot.value = value;
          slot.at = this.now().getTime();
          return value;
        })
        .catch((err) => {
          if (slot.value !== undefined) return slot.value;
          throw err;
        })
        .finally(() => {
          slot.pending = undefined;
        });
    }
    return slot.pending;
  }

  private async get(url: string): Promise<Response> {
    const res = await this.fetchImpl(url, { signal: AbortSignal.timeout(20_000), headers: { "User-Agent": "LogPose-OPTCG-Analyst/1.0" } });
    if (!res.ok) throw new Error(`${url} returned HTTP ${res.status}`);
    return res;
  }

  private async pdf(url: string) {
    return pdfPages(new Uint8Array(await (await this.get(url)).arrayBuffer()));
  }

  rules(): Promise<RulesDoc> {
    return this.cached("rules", async () => {
      const doc = parseRules((await this.pdf(this.url("/pdf/rule_comprehensive.pdf"))).flatMap(pageLines));
      if (doc.sections.length < 50) throw new Error("The comprehensive rules PDF didn't parse into sections.");
      return doc;
    });
  }

  /** Every FAQ table on the official FAQ page: per-set card rulings and the general rules Q&A. */
  faq(): Promise<FaqSet> {
    return this.cached("faq", async () => {
      const files = parseFaqIndex(await (await this.get(this.url("/rules/faq/"))).text(), this.url("/rules/faq/"));
      if (!files.length) throw new Error("No FAQ files found on the official FAQ page.");
      const entries: QaEntry[] = [];
      const general: QaEntry[] = [];
      const failed: string[] = [];
      // Two at a time keeps memory low enough for a small instance.
      for (let i = 0; i < files.length; i += 2) {
        await Promise.all(
          files.slice(i, i + 2).map(async (f) => {
            try {
              const rows = parseQaTable(await this.pdf(f.url));
              (f.general ? general : entries).push(...rows);
            } catch {
              failed.push(f.url);
            }
          }),
        );
      }
      if (failed.length === files.length) throw new Error("None of the official FAQ files could be read.");
      return { entries, general, files: files.length, failed };
    });
  }

  banList(): Promise<BanList> {
    return this.cached("banlist", async () => {
      const url = this.url("/news/restriction.html");
      const list = parseBanList(await (await this.get(url)).text(), this.now().toISOString().slice(0, 10), url);
      if (!list.banned.length && !list.bannedPairs.length) throw new Error("The official ban list page didn't parse.");
      return list;
    });
  }

  errata(): Promise<Erratum[]> {
    return this.cached("errata", async () => parseErrata(await (await this.get(this.url("/rules/errata_card/"))).text()));
  }

  /** Start loading everything in the background, so the first question doesn't wait for every PDF. */
  warm(): void {
    for (const load of [() => this.rules(), () => this.banList(), () => this.errata(), () => this.faq()]) {
      load().catch((err) => console.error(JSON.stringify({ event: "official_load_failed", message: err instanceof Error ? err.message : String(err) })));
    }
  }
}

/** Resolves to undefined instead of waiting past `ms`, so a slow site can't hang a tool call. */
export async function within<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
