import { Menu, MenuButton, MenuItem, MenuList } from "@optcg/ui/popups";
import { useState, type ReactNode } from "react";
import { GroupBuyDetail, GroupBuyMember, type DeckSummary } from "../../api";
import { MoreIcon } from "../../ui/HeadPopover";
import { DeckIncludeFilter } from "../../ui/DeckIncludeFilter";
import { GROUP_BUY_STEPS, stepIndex, type GroupBuyActionKey, type GroupBuyActions } from "./groupBuyActions";
import { buyingForText, yourShare } from "./yourShare";

/** Open → Locked → Ordered → Purchased. Text and a check mark show progress, not colour alone. */
export function GroupBuyStepper({ status }: { status: string }) {
  const current = stepIndex(status);
  return (
    <ol className="gb-stepper" aria-label="Group buy progress">
      {GROUP_BUY_STEPS.map((step, i) => {
        const state = i < current ? "done" : i === current ? "current" : "todo";
        return (
          <li key={step.status} className={`gb-step ${state}`} aria-current={state === "current" ? "step" : undefined}>
            <span className="gb-step-mark" aria-hidden="true">
              {state === "done" ? "✓" : i + 1}
            </span>
            <span className="gb-step-label">{step.label}</span>
            {state === "done" ? <span className="sr-only"> (done)</span> : null}
          </li>
        );
      })}
    </ol>
  );
}

export type ActionDef = {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  testId?: string;
  danger?: boolean;
};

/** One primary button for the current step, a few secondary ones, the rare ones under More. */
export function GroupBuyActionBar({
  actions,
  defs,
}: {
  actions: GroupBuyActions;
  defs: Partial<Record<GroupBuyActionKey, ActionDef>>;
}) {
  const button = (key: GroupBuyActionKey, cls: string): ReactNode => {
    const d = defs[key];
    if (!d) return null;
    return (
      <button
        key={key}
        type="button"
        className={`btn ${cls}`}
        data-testid={d.testId}
        disabled={d.disabled}
        title={d.title}
        onClick={d.onClick}
      >
        {d.label}
      </button>
    );
  };
  const more = actions.more.filter((k) => defs[k]);
  return (
    <div className="gb-actions">
      {actions.primary ? button(actions.primary, "primary") : null}
      {actions.secondary.map((k) => button(k, "secondary"))}
      {more.length > 0 ? (
        <Menu as="div" className="head-popover gb-more">
          <MenuButton type="button" className="ghost gb-more-btn" aria-label="More actions" title="More actions">
            <MoreIcon />
          </MenuButton>
          <MenuList
            anchor={{ to: "bottom end", gap: 6, padding: 8 }}
            className="head-popover-panel head-popover-menu"
            style={{ width: "min(14rem, calc(100vw - 16px))" }}
          >
            {more.map((k) => {
              const d = defs[k]!;
              return (
                <MenuItem key={k} disabled={d.disabled}>
                  <button type="button" className={d.danger ? "danger" : undefined} data-testid={d.testId} title={d.title} onClick={d.onClick}>
                    {d.label}
                  </button>
                </MenuItem>
              );
            })}
          </MenuList>
        </Menu>
      ) : null}
    </div>
  );
}

/** The signed-in member's own numbers, and (while open) which of their decks feed the buy. */
export function YourShareCard({
  detail,
  me,
  decks,
  activeDeckIds,
  allSelected,
  includeSingles,
  includeExtraCopies,
  busy,
  resetBusy,
  onDecks,
  onSelectAll,
  onFlag,
  onReset,
}: {
  detail: GroupBuyDetail;
  me: GroupBuyMember;
  decks: DeckSummary[];
  activeDeckIds: number[] | null | undefined;
  allSelected: boolean;
  includeSingles: boolean;
  includeExtraCopies: boolean;
  busy: boolean;
  resetBusy: boolean;
  onDecks: (next: number[]) => void;
  onSelectAll: () => void;
  onFlag: (patch: { include_singles?: boolean; include_extra_copies?: boolean }) => void;
  onReset: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const open = detail.status === "open";
  const share = yourShare(detail.status, me);
  const h = share.headline;
  return (
    <section className="gb-share" aria-label="Your share" data-testid="gb-your-share">
      <div className="gb-share-main">
        <p className="gb-share-line">
          {h.before}
          <strong>{h.strong}</strong>
          {h.after}
          {h.afterStrong ? <strong>{h.afterStrong}</strong> : null}
        </p>
        {share.detail ? <p className="gb-share-detail muted">{share.detail}</p> : null}
      </div>
      {open ? (
        <>
          <div className="gb-share-for">
            <span className="gb-share-for-text">
              <span className="muted">Buying for: </span>
              {buyingForText(decks, activeDeckIds, includeSingles, includeExtraCopies)}
            </span>
            <span className="gb-share-for-actions">
              <button type="button" className="btn secondary gb-share-edit" aria-expanded={editing} onClick={() => setEditing((v) => !v)}>
                {editing ? "Done" : "Edit"}
              </button>
              <button type="button" className="ghost" disabled={resetBusy} onClick={onReset}>
                {resetBusy ? "Resetting…" : "Reset to my Shopping list"}
              </button>
            </span>
          </div>
          {editing ? (
            <DeckIncludeFilter
              heading="Include"
              decks={decks}
              selectedIds={allSelected ? decks.map((d) => d.id) : (activeDeckIds ?? [])}
              onChange={onDecks}
              onSelectAll={onSelectAll}
              selectAllLabel="Select all decks"
              selectAllDisabled={allSelected}
              showSelectAll={decks.length > 0}
              disabled={busy}
              otherChips={[
                { key: "singles", label: "Cards not in a deck", checked: includeSingles, onChange: (v) => onFlag({ include_singles: v }) },
                { key: "extra-copies", label: "Extra copies", checked: includeExtraCopies, onChange: (v) => onFlag({ include_extra_copies: v }) },
              ]}
              note={
                <p className="muted group-buy-deck-filter-note">
                  Unchecked decks and cards are left out of your share. Extra copies adds the alt arts you marked as Extra copy.
                </p>
              }
            />
          ) : null}
        </>
      ) : null}
    </section>
  );
}

export function PencilIcon() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M13.5 3.5 16.5 6.5 7 16H4v-3z" />
      <path d="M12 5l3 3" />
    </svg>
  );
}
