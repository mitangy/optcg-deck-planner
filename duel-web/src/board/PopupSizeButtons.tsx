import { updateSettings, useDuelSettings } from "../settings";
import { POPUP_SIZE_MAX, POPUP_SIZE_MIN, clampPopupSize, stepPopupSize } from "./popupSize";

/** The Pop-up size setting as a multiplier (1 = 100%). */
export function usePopupScale(): number {
  return clampPopupSize(useDuelSettings().popupSize) / 100;
}

/**
 * "−" / "+" for a pop-up's header: both step the one Pop-up size setting, so
 * every in-game pop-up follows. Buttons, so a header drag never starts on them.
 */
export function PopupSizeButtons({ className, what = "pop-ups" }: { className: string; /** What the buttons name: "card preview" on the hover card, "pop-ups" elsewhere. */ what?: string }) {
  const size = clampPopupSize(useDuelSettings().popupSize);
  return (
    <span className="popup-size-btns" role="group" aria-label="Pop-up size">
      <button
        type="button"
        className={className}
        aria-label={`Smaller ${what}`}
        title={`Smaller (${size}%)`}
        disabled={size <= POPUP_SIZE_MIN}
        onClick={() => updateSettings({ popupSize: stepPopupSize(size, -1) })}
      >
        −
      </button>
      <button
        type="button"
        className={className}
        aria-label={`Bigger ${what}`}
        title={`Bigger (${size}%)`}
        disabled={size >= POPUP_SIZE_MAX}
        onClick={() => updateSettings({ popupSize: stepPopupSize(size, 1) })}
      >
        +
      </button>
    </span>
  );
}
