import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";
import { board, CARD_BACK, DON_ART, type Card } from "../shared/data";
import { Icon } from "./ui";

/*
 * Board sizing lives in ONE custom property, --cw (card width). Every slot, pile, DON card
 * and hand card derives from it, so the three layouts (phone portrait / phone landscape /
 * desktop) differ by a single line each instead of hundreds of per-breakpoint rules.
 * `short:` is a custom variant (max-height: 520px) = phone landscape.
 */
const SIZE =
  "[--cw:min(70px,calc((100vw_-_52px)/5.9))] sm:[--cw:min(80px,calc((100vw_-_80px)/12.1))] " +
  "lg:[--cw:min(92px,calc((100vw_-_384px)/12.1),calc((100dvh_-_270px)/5.7))] " +
  "short:[--cw:min(64px,calc((100vw_-_262px)/12.1),calc((100dvh_-_140px)/3.95))]";

const PHASES = ["Refresh", "Draw", "DON!!", "Main", "End"];
const LOG = [
  { who: "foe", title: "Guard Point", text: "Opponent countered +1000" },
  { who: "me", title: "Buckin", text: "You attacked · Turn 6" },
  { who: "me", title: "Kyo", text: "You played · Turn 6" },
  { who: "foe", title: "Battle hits", text: "7000 vs 6000" },
  { who: "foe", title: "Opponent takes 1 damage", text: "Life 4 → 3" },
  { who: "me", title: "Don Marlon", text: "You played · Turn 6" },
  { who: "foe", title: "Magura", text: "Opponent played · Turn 5" },
  { who: "me", title: "DON!! +2", text: "Attached to Buckin" },
];

/** A face-up card filling its parent. Rested cards are rotated 90deg about the slot centre. */
function Face({ card, rested, big }: { card: Card; rested?: boolean; big?: boolean }) {
  const power = (card.power ?? 0) + (card.don ?? 0) * 1000;
  return (
    <div className={`absolute aspect-[63/88] w-full overflow-hidden rounded-[7%] bg-arena-abyss shadow-[0_3px_8px_rgb(0_0_0/0.55)] ring-1 ring-black/60 transition-transform ${rested ? "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rotate-90 brightness-90" : "inset-0"}`}>
      <img src={card.image} alt={card.name} draggable={false} className="size-full object-cover" />
      {card.power != null && (
        <span className={`absolute rounded px-1 text-[9px] font-bold leading-4 text-white backdrop-blur-sm ${rested ? "-rotate-90" : ""} ${card.don ? "bg-jade/90" : "bg-black/65"} ${rested ? "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" : "bottom-0.5 left-0.5"}`}>{power}</span>
      )}
      {!!card.don && <span className={`absolute right-0.5 top-0.5 rounded bg-chrome px-1 text-[9px] font-bold leading-4 text-[#1d1406] ${rested ? "-rotate-90" : ""}`}>+{card.don} DON</span>}
      {big && <span className="absolute inset-x-0 bottom-0 hidden truncate bg-linear-to-t from-black/85 to-transparent px-1.5 pb-0.5 pt-3 text-[10px] font-semibold lg:block short:!hidden">{card.name}</span>}
    </div>
  );
}

function Back({ className = "" }: { className?: string }) {
  return <img src={CARD_BACK} alt="" draggable={false} className={`aspect-[63/88] rounded-[7%] object-cover ring-1 ring-black/60 ${className}`} />;
}

function Slot({ label, children, className = "" }: { label?: string; children?: React.ReactNode; className?: string }) {
  return (
    <div className={`relative aspect-[63/88] w-full ${className}`}>
      {children ?? (
        <div className="grid size-full place-items-center rounded-[7%] border border-dashed border-white/15 text-[9px] font-semibold uppercase tracking-widest text-white/25 sm:text-[10px]">{label}</div>
      )}
    </div>
  );
}

function Count({ n, className = "" }: { n: number | string; className?: string }) {
  return <span className={`absolute z-10 rounded-full border border-chrome/40 bg-arena-abyss/90 px-1.5 text-[11px] font-bold leading-5 text-chrome-bright tabular-nums ${className}`}>{n}</span>;
}

function Chip({ icon, n, label, tone = "" }: { icon: "heart" | "deck" | "trash" | "bolt"; n: number; label: string; tone?: string }) {
  return (
    <div title={label} className="flex min-w-0 items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-black/25 px-1.5 py-1 text-sm font-bold">
      <Icon name={icon} className={`size-3.5 ${tone || "text-tide-bright"}`} />
      <span className="tabular-nums">{n}</span>
      <span className="truncate text-[10px] font-semibold uppercase tracking-wide text-haze">{label}</span>
    </div>
  );
}

const CHAR_COL = ["col-start-1 sm:col-start-4", "col-start-2 sm:col-start-5", "col-start-3 sm:col-start-6", "col-start-4 sm:col-start-7", "col-start-5 sm:col-start-8"];

function Don({ active, rested, deck, foe }: { active: number; rested: number; deck: number; foe?: boolean }) {
  const one = (state: "a" | "r", i: number) => (
    <div key={state + i} className={`relative shrink-0 ${state === "a" ? "w-(--dw)" : "w-(--dh)"} h-(--dh)`}>
      <img
        src={DON_ART} alt="" draggable={false}
        className={`absolute left-1/2 top-1/2 aspect-[63/88] w-(--dw) -translate-x-1/2 -translate-y-1/2 rounded-[7%] object-cover ring-1 ring-black/70 ${state === "r" ? "rotate-90 opacity-55 grayscale-[.5]" : "shadow-[0_0_8px_rgb(240_220_168/0.35)]"}`}
      />
    </div>
  );
  return (
    <div className="col-span-full row-start-3 flex min-w-0 items-center gap-1.5 rounded-lg bg-black/20 px-2 py-1 [--dh:calc(var(--dw)*88/63)] [--dw:calc(var(--cw)*.4)] sm:row-start-2">
      <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-haze">DON!! <b className={`${foe ? "text-crimson-bright" : "text-chrome-bright"} tabular-nums`}>{active}/{active + rested}</b></span>
      <div className="flex min-w-0 flex-1 items-center gap-[calc(var(--dw)*.12)]">
        {Array.from({ length: active }, (_, i) => one("a", i))}
        {Array.from({ length: rested }, (_, i) => one("r", i))}
      </div>
      <div className="relative ml-auto w-(--dw) shrink-0">
        <img src={DON_ART} alt="DON deck" className="aspect-[63/88] w-full rounded-[7%] object-cover opacity-90 ring-1 ring-jade/60 shadow-[1.5px_1.5px_0_var(--color-jade)]" />
        <Count n={deck} className="-bottom-1 -right-1 !px-1 !text-[10px] !leading-4" />
      </div>
    </div>
  );
}

function Mat({ foe, side, trashCard, going }: { foe?: boolean; side: typeof board.me | typeof board.opp; trashCard: Card; going: string }) {
  const chars = side.chars;
  return (
    <section
      className={`relative mt-3 grid min-w-0 grid-cols-[repeat(5,var(--cw))] justify-between gap-y-2 rounded-2xl border px-4 pb-2.5 pt-4 sm:px-2.5 sm:grid-cols-[repeat(10,var(--cw))] sm:justify-center sm:gap-x-[calc(var(--cw)*.22)] ${
        foe
          ? "border-crimson/35 bg-linear-to-b from-mat-foe to-mat-foe-low"
          : "border-chrome/55 bg-linear-to-b from-mat to-mat-low shadow-[0_0_0_1px_rgb(210_165_77/0.25),0_0_36px_rgb(210_165_77/0.14)]"
      }`}
    >
      <span className={`absolute -top-2.5 left-3 z-20 whitespace-nowrap sm:left-1/2 sm:-translate-x-1/2 flex items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-bold leading-5 ${foe ? "border-crimson/50 bg-[#2a1618] text-[#f0a79f]" : "border-chrome/60 bg-linear-to-b from-[#e6bd62] to-[#c7963d] text-[#1d1406]"}`}>
        {side.name} <span className="font-semibold opacity-70">· {going}</span>
      </span>

      {/* Phone only: life/deck/trash/DON as stat chips beside the leader and stage */}
      <div className="col-span-3 col-start-3 row-start-1 grid grid-cols-2 content-center gap-1.5 sm:hidden">
        <Chip icon="heart" n={side.life} label="Life" tone="text-crimson-bright" />
        <Chip icon="deck" n={side.deck} label="Deck" />
        <Chip icon="trash" n={side.trash} label="Trash" />
        <Chip icon="bolt" n={side.don.deck} label="DON" tone="text-jade" />
      </div>

      {/* Life stack */}
      <Slot className="hidden sm:col-start-1 sm:row-start-1 sm:block">
        <div className="flex size-full flex-col gap-[3%]">
          {Array.from({ length: side.life }, (_, i) => (
            <div key={i} className="min-h-0 flex-1 overflow-hidden rounded-[6%] ring-1 ring-black/60"><img src={CARD_BACK} alt="" className="w-full object-cover object-top" /></div>
          ))}
        </div>
        <Count n={side.life} className="-bottom-1.5 left-1/2 -translate-x-1/2" />
      </Slot>

      <Slot className="col-start-1 row-start-1 sm:col-start-2"><Face card={side.leader} big /></Slot>
      <Slot label="Stage" className="col-start-2 row-start-1 sm:col-start-3" />

      {Array.from({ length: 5 }, (_, i) => (
        <Slot key={i} className={`row-start-2 sm:row-start-1 ${CHAR_COL[i]}`} {...(chars[i] ? {} : { label: "" })}>
          {chars[i] ? <Face card={chars[i]} rested={chars[i].rested} big /> : undefined}
        </Slot>
      ))}

      {/* Deck + trash piles */}
      <Slot className="hidden sm:col-start-9 sm:row-start-1 sm:block">
        <Back className="size-full shadow-[2px_2px_0_#1b2f55,4px_4px_0_#142342]" />
        <Count n={side.deck} className="-bottom-1.5 left-1/2 -translate-x-1/2" />
      </Slot>
      <Slot className="hidden sm:col-start-10 sm:row-start-1 sm:block">
        <Face card={{ ...trashCard, power: null }} />
        <Count n={side.trash} className="-bottom-1.5 left-1/2 -translate-x-1/2" />
      </Slot>

      <Don active={side.don.active} rested={side.don.rested} deck={side.don.deck} foe={foe} />
    </section>
  );
}

function Hand({ cards, grid }: { cards: Card[]; grid?: boolean }) {
  const mid = (cards.length - 1) / 2;
  const afford = (c: Card) => (c.cost ?? 0) <= board.me.don.active;
  if (grid) {
    return (
      <div className="grid grid-cols-3 gap-1.5">
        {cards.map((c) => (
          <div key={c.id} className={`relative aspect-[63/88] ${afford(c) ? "" : "brightness-[.6]"}`}>
            <Face card={{ ...c, power: null }} />
            <span className="absolute left-0.5 top-0.5 grid size-4 place-items-center rounded-full bg-tide text-[10px] font-bold">{c.cost}</span>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="flex items-end justify-center pb-1 pt-4 [--hw:calc(var(--cw)*1.25)] [--ov:.42] lg:[--ov:.12]">
      {cards.map((c, i) => (
        <div
          key={c.id}
          style={{ "--r": `${(i - mid) * 3.5}deg`, "--y": `${Math.pow(i - mid, 2) * 2}px`, zIndex: i } as React.CSSProperties}
          className={`relative -ml-[calc(var(--hw)*var(--ov))] aspect-[63/88] w-(--hw) shrink-0 rotate-(--r) translate-y-(--y) transition-transform first:ml-0 hover:z-30 hover:-translate-y-5 hover:rotate-0 ${afford(c) ? "drop-shadow-[0_0_6px_rgb(210_165_77/0.5)]" : "brightness-[.6] saturate-50"}`}
        >
          <Face card={{ ...c, power: null }} />
          <span className="absolute left-1 top-1 z-10 grid size-5 place-items-center rounded-full border border-white/30 bg-tide text-[11px] font-bold shadow">{c.cost}</span>
        </div>
      ))}
    </div>
  );
}

function PhasePips() {
  return (
    <ol className="mt-2 flex gap-1">
      {PHASES.map((p) => (
        <li key={p} className={`flex-1 rounded px-0.5 py-1 text-center text-[9px] font-bold uppercase tracking-wide short:text-[7.5px] short:tracking-normal ${p === board.phase ? "bg-chrome text-[#1d1406]" : "bg-black/25 text-haze"}`}>{p}</li>
      ))}
    </ol>
  );
}

function Actions({ compact }: { compact?: boolean }) {
  return (
    <div className={`grid gap-2 ${compact ? "" : "grid-cols-2"}`}>
      <button className={`btn-chrome relative ${compact ? "!py-2.5" : "col-span-2 !py-3 !text-base"}`}>
        End turn {!compact && <kbd className="absolute right-3 rounded bg-black/15 px-1.5 text-[10px] font-semibold">Space</kbd>}
      </button>
      {!compact && (
        <>
          <button className="btn-ghost-duel"><Icon name="sword" className="size-4" /> Attack</button>
          <button className="btn-ghost-duel"><Icon name="bolt" className="size-4" /> Activate</button>
        </>
      )}
    </div>
  );
}

function Stat({ k, v }: { k: string; v: string | number }) {
  return <div className="text-center"><div className="label-caps !text-[9px] text-haze">{k}</div><div className="text-lg font-bold leading-tight tabular-nums">{v}</div></div>;
}

function PlayerRow({ foe }: { foe?: boolean }) {
  const s = foe ? board.opp : board.me;
  return (
    <div className={`rounded-xl border p-2.5 ${foe ? "border-white/10 bg-black/15" : "border-chrome/40 bg-chrome/5"}`}>
      <div className="mb-1.5 flex items-center justify-between text-sm font-bold">
        <span className="flex items-center gap-2"><span className={`size-2 rounded-full ${foe ? "bg-crimson-bright" : "bg-chrome"}`} />{foe ? "Opponent" : "You"}</span>
        <span className="rounded-full border border-white/10 px-2 text-[10px] font-semibold text-haze">{foe ? "2nd" : "1st"}</span>
      </div>
      <div className="grid grid-cols-4">
        <Stat k="Life" v={s.life} /><Stat k="Hand" v={foe ? board.opp.hand : board.me.hand.length} /><Stat k="Deck" v={s.deck} /><Stat k="DON!!" v={`${s.don.active}/${s.don.active + s.don.rested}`} />
      </div>
    </div>
  );
}

function BoardMenu() {
  return (
    <Menu>
      <MenuButton aria-label="Match menu" className="grid size-8 place-items-center rounded-lg border border-chrome/25 bg-arena-panel text-bone transition hover:border-chrome/60"><Icon name="dots" className="size-4" /></MenuButton>
      <MenuItems transition anchor="bottom end" className="menu-panel [--anchor-gap:6px]">
        {["Settings", "Battle log", "Offer draw"].map((l) => <MenuItem key={l}><button className="menu-item">{l}</button></MenuItem>)}
        <div className="my-1 h-px bg-chrome/15" />
        <MenuItem><button className="menu-item !text-crimson-bright data-focus:!bg-crimson/20">Concede</button></MenuItem>
      </MenuItems>
    </Menu>
  );
}

export default function DuelBoard() {
  const { me, opp } = board;
  return (
    <div className={`waves flex h-dvh min-w-0 flex-col overflow-hidden ${SIZE}`}>
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-chrome/20 bg-arena-abyss/80 px-3 short:h-9">
        <a href="#/duel/home" aria-label="Leave match" className="grid size-8 place-items-center rounded-lg text-haze hover:text-bone"><Icon name="back" /></a>
        <span className="font-display text-base font-bold text-chrome-bright max-sm:hidden">OPTCG Duel</span>
        <span className="rounded-full border border-chrome/30 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider text-bone">{board.phase} · T{board.turn}</span>
        <span className="rounded-full bg-chrome/20 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider text-chrome-bright">Your turn</span>
        <span className="ml-auto hidden items-center gap-1.5 text-xs font-semibold text-haze short:flex"><Back className="w-3.5" />{opp.hand} in hand</span>
        <BoardMenu />
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-2 p-2 lg:flex-row lg:gap-3 lg:p-3 short:flex-row short:gap-2 short:p-2">
        <main className="flex min-h-0 min-w-0 flex-1 flex-col justify-center gap-1 overflow-y-auto overflow-x-clip [scrollbar-width:none]">
          {/* Opponent hand: card backs */}
          <div className="flex items-center justify-center gap-2 short:hidden">
            <span className="label-caps text-haze">Opp hand</span>
            <div className="flex">{Array.from({ length: opp.hand }, (_, i) => <Back key={i} className="-ml-2 w-6 first:ml-0 lg:w-8" />)}</div>
            <span className="text-xs font-bold text-haze">{opp.hand}</span>
          </div>
          <Mat foe side={opp} trashCard={opp.chars[0]} going="Going 2nd" />
          <Mat side={me} trashCard={me.hand[0]} going="Going 1st" />
          <div className="short:hidden">
            <div className="flex items-center justify-between px-1 pt-1.5">
              <h2 className="font-display text-base font-semibold">Hand <span className="text-haze">{me.hand.length}</span></h2>
              <div className="flex gap-1.5"><button className="btn-ghost-duel !px-2.5 !py-1 text-xs">Sort</button><button className="btn-ghost-duel !px-2.5 !py-1 text-xs">Hide</button></div>
            </div>
            <Hand cards={me.hand} />
          </div>
        </main>

        {/* Phone portrait / tablet: slim action bar */}
        <aside className="flex shrink-0 items-center gap-2 lg:hidden short:hidden">
          <button className="btn-ghost-duel mr-auto shrink-0">Log <span className="rounded-full bg-black/30 px-1.5 text-[11px] text-haze">18</span></button>
          <p className="hidden min-w-0 flex-1 truncate text-xs text-haze sm:block">Select a card for actions</p>
          <button className="btn-ghost-duel shrink-0"><Icon name="sword" className="size-4" /> Attack</button>
          <button className="btn-chrome shrink-0 !px-5 !py-2.5">End turn</button>
        </aside>

        {/* Desktop side column */}
        <aside className="hidden min-h-0 w-80 shrink-0 flex-col gap-3 lg:flex short:hidden">
          <div className="panel-duel border-chrome/40 p-3 text-center">
            <div className="label-caps text-haze">Turn {board.turn}</div>
            <div className="font-display text-2xl font-bold text-chrome-bright">Your turn</div>
            <PhasePips />
          </div>
          <div className="flex flex-col gap-2"><PlayerRow foe /><PlayerRow /></div>
          <Actions />
          <div className="panel-duel flex min-h-0 flex-col p-3">
            <div className="mb-2 flex items-center justify-between"><h2 className="label-caps text-chrome">Recent plays</h2><span className="text-xs text-haze">18</span></div>
            <ul className="flex min-h-0 flex-col gap-1.5 overflow-y-auto pr-1">
              {LOG.map((l, i) => (
                <li key={i} className={`border-l-2 py-0.5 pl-2.5 ${l.who === "me" ? "border-tide-bright" : "border-crimson-bright"}`}>
                  <div className="truncate text-sm font-semibold">{l.title}</div>
                  <div className="truncate text-xs text-haze">{l.text}</div>
                </li>
              ))}
            </ul>
          </div>
        </aside>

        {/* Phone landscape side column: turn, hand, End turn */}
        <aside className="hidden min-h-0 w-[196px] shrink-0 flex-col gap-2 short:flex">
          <div className="rounded-xl border border-chrome/40 bg-arena-panel/80 p-2 text-center">
            <div className="font-display text-lg font-bold leading-none text-chrome-bright">Your turn</div>
            <PhasePips />
          </div>
          <div className="flex items-center justify-between px-0.5"><h2 className="font-display text-sm font-semibold">Hand <span className="text-haze">{me.hand.length}</span></h2><span className="text-[10px] font-bold uppercase text-haze">Sort</span></div>
          <Hand cards={me.hand} grid />
          <div className="mt-auto"><Actions compact /></div>
        </aside>
      </div>
    </div>
  );
}
