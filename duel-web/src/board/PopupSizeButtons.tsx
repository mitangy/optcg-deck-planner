import { updateSettings, useDuelSettings } from "../settings";
import { POPUP_SIZE_MAX, POPUP_SIZE_MIN, clampPopupSize, stepPopupSize, type PopupSizeKey } from "./popupSize";

/** The Pop-up size setting as a multiplier (1 = 100%). */
export function usePopupScale(): number {
  return clampPopupSize(useDuelSettings().popupSize) / 100;
}

/**
 * "−" / "+" for a pop-up's header: both step one size setting. Pop-ups step the
 * Pop-up size, so every one of them follows; the hover card steps its own
 * Card pop-up size (`setting`). Buttons, so a header drag never starts on them.
 */
export function PopupSizeButtons({
  className,
  what = "pop-ups",
  setting = "popupSize",
}: {
  className: string;
  /** What the buttons name: "card preview" on the hover card, "pop-ups" elsewhere. */
  what?: string;
  /** Which size setting the buttons step. */
  setting?: PopupSizeKey;
}) {
  const size = clampPopupSize(useDuelSettings()[setting]);
  return (
    <span className="popup-size-btns" role="group" aria-label={setting === "previewPopupSize" ? "Card pop-up size" : "Pop-up size"}>
      <button
        type="button"
        className={className}
        aria-label={`Smaller ${what}`}
        title={`Smaller (${size}%)`}
        disabled={size <= POPUP_SIZE_MIN}
        onClick={() => updateSettings({ [setting]: stepPopupSize(size, -1) })}
      >
        −
      </button>
      <button
        type="button"
        className={className}
        aria-label={`Bigger ${what}`}
        title={`Bigger (${size}%)`}
        disabled={size >= POPUP_SIZE_MAX}
        onClick={() => updateSettings({ [setting]: stepPopupSize(size, 1) })}
      >
        +
      </button>
    </span>
  );
}
