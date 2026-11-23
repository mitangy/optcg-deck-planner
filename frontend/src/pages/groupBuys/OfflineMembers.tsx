import { Dialog, DialogTitle, Menu, MenuButton, MenuItem, MenuList, Select } from "@optcg/ui/popups";
import { useState, type FormEvent, type ReactNode } from "react";
import type { GroupBuyMember } from "../../api";
import { CatalogAddDrawer } from "../collection/CatalogAddDrawer";
import { MoreIcon } from "../../ui/HeadPopover";
import { MemberSwatch } from "./memberColors";
import { pasteSummary } from "./offlineMembersModel";

const NAME_MAX = 40;

function DialogShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Dialog open onClose={onClose} className="gb-dialog gb-dialog-sheet" panelClassName="gb-dialog-panel gb-offline-panel" label={title}>
      {children}
    </Dialog>
  );
}

function DialogHead({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="gb-dialog-head">
      <DialogTitle as="h2" className="gb-dialog-title">
        {title}
      </DialogTitle>
      <button type="button" className="ghost gb-dialog-x" aria-label="Close" onClick={onClose}>
        ✕
      </button>
    </div>
  );
}

/** Add someone, or rename them: one name field. */
export function OfflineNameDialog({
  title,
  confirmLabel,
  initial = "",
  busy,
  error,
  onSubmit,
  onClose,
}: {
  title: string;
  confirmLabel: string;
  initial?: string;
  busy: boolean;
  error: string | null;
  onSubmit: (name: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial);
  const clean = name.trim();
  function submit(e: FormEvent) {
    e.preventDefault();
    if (clean && !busy) onSubmit(clean);
  }
  return (
    <DialogShell title={title} onClose={onClose}>
      <form className="gb-dialog-form" onSubmit={submit}>
        <DialogHead title={title} onClose={onClose} />
        <div className="gb-dialog-body">
          <label className="gb-offline-field">
            Name
            <input
              type="text"
              value={name}
              maxLength={NAME_MAX}
              autoFocus
              autoComplete="off"
              data-testid="gb-offline-name"
              placeholder="A friend, a sibling…"
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <p className="muted gb-offline-note">
            They do not need the app. You choose their cards and see what they owe on its own line.
          </p>
        </div>
        <div className="gb-dialog-foot">
          <p className="error gb-dialog-error" role="alert">
            {error}
          </p>
          <div className="gb-dialog-buttons">
            <button type="button" className="btn secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn primary" disabled={!clean || busy} data-testid="gb-offline-save">
              {busy ? "Saving…" : confirmLabel}
            </button>
          </div>
        </div>
      </form>
    </DialogShell>
  );
}

/** Paste a deck list or card codes; the server sets their cards from it and hands back the lines it could not read. */
export function PasteCardsDialog({
  name,
  busy,
  error,
  result,
  onSubmit,
  onClose,
}: {
  name: string;
  busy: boolean;
  error: string | null;
  result: { applied: number; unmatched: string[] } | null;
  onSubmit: (text: string) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const title = `Paste ${name}'s list`;
  return (
    <DialogShell title={title} onClose={onClose}>
      <form
        className="gb-dialog-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim() && !busy) onSubmit(text);
        }}
      >
        <DialogHead title={title} onClose={onClose} />
        <div className="gb-dialog-body">
          <label className="gb-offline-field">
            Cards
            <textarea
              value={text}
              rows={8}
              maxLength={20000}
              autoFocus
              spellCheck={false}
              data-testid="gb-offline-paste"
              placeholder={"4xOP01-001\n2 OP01-016\nOP05-060 x3"}
              onChange={(e) => setText(e.target.value)}
            />
          </label>
          <p className="muted gb-offline-note">One card per line. This replaces the cards you set for {name} before.</p>
          {result ? (
            <div className="gb-offline-result" role="status">
              <p>{pasteSummary(result, name)}</p>
              {result.unmatched.length > 0 ? (
                <ul className="gb-offline-unmatched" aria-label="Lines not recognised">
                  {result.unmatched.map((line, i) => (
                    <li key={`${i}:${line}`}>{line}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="gb-dialog-foot">
          <p className="error gb-dialog-error" role="alert">
            {error}
          </p>
          <div className="gb-dialog-buttons">
            <button type="button" className="btn secondary" onClick={onClose}>
              {result ? "Done" : "Cancel"}
            </button>
            <button type="submit" className="btn primary" disabled={!text.trim() || busy} data-testid="gb-offline-paste-save">
              {busy ? "Saving…" : "Set their cards"}
            </button>
          </div>
        </div>
      </form>
    </DialogShell>
  );
}

/** Find a card that is not on the list yet and add one copy for them. */
export function AddCardDialog({
  name,
  busy,
  error,
  onAdd,
  onClose,
}: {
  name: string;
  busy: boolean;
  error: string | null;
  onAdd: (cardId: string) => void;
  onClose: () => void;
}) {
  const title = `Add a card for ${name}`;
  return (
    <DialogShell title={title} onClose={onClose}>
      <div className="gb-dialog-form">
        <DialogHead title={title} onClose={onClose} />
        <div className="gb-dialog-body">
          <CatalogAddDrawer
            bare
            className="gb-offline-search"
            summary=""
            storageKey="gb_offline_add"
            defaultOpen
            idleHint="Search a card by name or ID, then add it."
            renderAction={(card) => (
              <button type="button" className="btn secondary" disabled={busy} onClick={() => onAdd(card.card_id)}>
                Add 1
              </button>
            )}
          />
        </div>
        <div className="gb-dialog-foot">
          <p className="error gb-dialog-error" role="alert">
            {error}
          </p>
          <div className="gb-dialog-buttons">
            <button type="button" className="btn secondary" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      </div>
    </DialogShell>
  );
}

/** Rename or remove, from one small menu on the member. */
export function OfflineMemberMenu({
  member,
  onRename,
  onRemove,
}: {
  member: GroupBuyMember;
  onRename: () => void;
  onRemove: () => void;
}) {
  return (
    <Menu as="div" className="head-popover gb-offline-menu">
      <MenuButton type="button" className="ghost gb-more-btn" aria-label={`Options for ${member.display_name}`} title="Rename or remove">
        <MoreIcon />
      </MenuButton>
      <MenuList
        anchor={{ to: "bottom end", gap: 6, padding: 8 }}
        className="head-popover-panel head-popover-menu"
        style={{ width: "min(12rem, calc(100vw - 16px))" }}
      >
        <MenuItem>
          <button type="button" onClick={onRename}>
            Rename
          </button>
        </MenuItem>
        <MenuItem>
          <button type="button" className="danger" onClick={onRemove}>
            Remove
          </button>
        </MenuItem>
      </MenuList>
    </Menu>
  );
}

/** Host only: whose cards the steppers below edit, plus paste and add-a-card for an offline member. */
export function BuyingForBar({
  members,
  offline,
  value,
  onChange,
  onPaste,
  onAddCard,
}: {
  members: GroupBuyMember[];
  offline: GroupBuyMember[];
  value: GroupBuyMember | null;
  onChange: (userId: number | null) => void;
  onPaste: () => void;
  onAddCard: () => void;
}) {
  const options = [
    { value: "me", label: "You" },
    ...offline.map((m) => ({
      value: String(m.user_id),
      label: (
        <span className="gb-buying-opt">
          <MemberSwatch userId={m.user_id} members={members} />
          {m.display_name}
        </span>
      ),
      buttonLabel: m.display_name,
    })),
  ];
  return (
    <div className="gb-buying-for" data-testid="gb-buying-for">
      <label className="gb-buying-pick">
        <span className="gb-buying-label">Buying for</span>
        <Select
          value={value ? String(value.user_id) : "me"}
          onChange={(v) => onChange(v === "me" ? null : Number(v))}
          options={options}
          aria-label="Buying for"
        />
      </label>
      {value ? (
        <div className="gb-buying-actions">
          <button type="button" className="btn secondary" onClick={onAddCard}>
            Add a card
          </button>
          <button type="button" className="btn secondary" onClick={onPaste}>
            Paste their list
          </button>
        </div>
      ) : null}
      {value ? (
        <p className="muted gb-buying-hint">
          The steppers below set {value.display_name}&apos;s copies. Pick You to go back to your own.
        </p>
      ) : null}
    </div>
  );
}
