import { useId, useState, type FormEvent } from "react";
import { ApiError, updateUsername, type AuthUser } from "../net/api";
import { USERNAME_MAX, usernameFormatError } from "./username";

type Props = {
  /** Prefill (current username or a server suggestion). */
  initial: string;
  submitLabel: string;
  onSaved: (user: AuthUser) => void;
  /** When set, an unchanged value is a no-op instead of a PATCH. */
  current?: string | null;
  autoFocus?: boolean;
};

/**
 * Username input + save. Shared by the post-sign-in setup page and Settings.
 * The message row always reserves one line so errors never shift the layout.
 */
export function UsernameForm({ initial, submitLabel, onSaved, current, autoFocus }: Props) {
  const inputId = useId();
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const formatError = value.trim() ? usernameFormatError(value) : null;
  const unchanged = current != null && value.trim() === current;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const problem = usernameFormatError(value);
    if (problem) {
      setError(problem);
      return;
    }
    if (unchanged) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const user = await updateUsername(value);
      setValue(user.username ?? value.trim());
      setSaved(true);
      onSaved(user);
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError("Could not reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const message = error ?? formatError;

  return (
    <form className="username-form" onSubmit={submit} noValidate>
      <div className="field">
        <label htmlFor={inputId}>Username</label>
        <div className="field-inline">
          <input
            id={inputId}
            autoCapitalize="off"
            autoCorrect="off"
            autoComplete="username"
            spellCheck={false}
            maxLength={USERNAME_MAX}
            autoFocus={autoFocus}
            value={value}
            aria-invalid={message ? true : undefined}
            onChange={(e) => {
              setValue(e.target.value);
              setError(null);
              setSaved(false);
            }}
          />
          <button
            type="submit"
            className="btn btn-primary username-submit"
            disabled={busy || Boolean(formatError) || !value.trim() || unchanged}
          >
            {busy ? "Saving…" : submitLabel}
          </button>
        </div>
        <p
          className={`field-hint username-message${message ? " is-error" : saved ? " is-ok" : ""}`}
          role={message ? "alert" : undefined}
        >
          {message ??
            (saved
              ? "Saved. Opponents will see this name."
              : "3–20 letters, numbers, _ or -. Shown to opponents in duels.")}
        </p>
      </div>
    </form>
  );
}
