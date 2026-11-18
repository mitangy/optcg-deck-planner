import { updateSettings, useDuelSettings } from "../../settings";
import { POPUP_SIZE_MAX, POPUP_SIZE_MIN, clampPopupSize, stepPopupSize, type PopupSizeKey } from "./popupSize";

export function usePopupScale(): number {
  return clampPopupSize(useDuelSettings().popupSize) / 100;
}

export function PopupSizeButtons({
  className,
  what = "pop-ups",
  setting = "popupSize",
}: {
  className: string;
  what?: string;
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
