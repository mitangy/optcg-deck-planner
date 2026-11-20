import { cardBackCssValue, useCardBackUrl } from "../cardBack";
import { donArtUrl, fallbackToDefaultDon } from "../board/don/donArt";
import { usePlaymatUrl } from "../playmat";
import { useDuelSettings } from "../settings";

/** Theme, playmat, card back and DON!! card together, so one glance shows the whole look (#1389). */
export function LookPreview() {
  const settings = useDuelSettings();
  const playmatUrl = usePlaymatUrl();
  const cardBackUrl = useCardBackUrl();
  const mat = playmatUrl
    ? {
        backgroundImage: `linear-gradient(rgba(5, 10, 14, ${settings.playmatDim}), rgba(5, 10, 14, ${settings.playmatDim})), linear-gradient(rgba(14, 34, 48, ${1 - settings.playmatOpacity}), rgba(14, 34, 48, ${1 - settings.playmatOpacity})), url("${playmatUrl}")`,
      }
    : undefined;
  return (
    <div
      className="look-preview"
      style={mat}
      role="img"
      aria-label={`Your board: ${playmatUrl ? "your playmat" : "the default playmat"}, ${cardBackUrl ? "your card back" : "the official card back"} and ${settings.donArt == null ? "the default" : "your"} DON!! card`}
    >
      <span className="look-preview-tag" aria-hidden>
        Your board
      </span>
      <div className="look-preview-cards" aria-hidden>
        <div
          className="look-preview-back"
          style={{ backgroundImage: `${cardBackCssValue(cardBackUrl)}, linear-gradient(145deg, #243447, #15202c)` }}
        />
        <img className="look-preview-don" src={donArtUrl(settings.donArt)} alt="" draggable={false} onError={fallbackToDefaultDon} />
      </div>
    </div>
  );
}
