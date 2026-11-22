import { profileArtUrl } from "./profileArt";
import { useArtFallback } from "../cards/useArtFallback";
import "./profile.css";

const HUES = [12, 38, 150, 190, 215, 265, 320];

function hueFor(name: string): number {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return HUES[h % HUES.length];
}

/** A card's art cropped to a circle (toward the top, where the face is), or the first letter of the name when none is chosen. Shows the base art unless `artId` names one of its alt arts; never follows in-game deck art prefs. */
export function ProfileAvatar({ cardId, name, size, artId }: { cardId: string; name: string; size?: number; artId?: string }) {
  const { src, fail } = useArtFallback(cardId ? profileArtUrl(cardId, artId ?? "", "thumb") : null, cardId || null);
  const style = size ? { width: size, height: size, fontSize: size * 0.46 } : undefined;
  if (cardId && src) {
    return (
      <span className="profile-avatar" style={style} aria-hidden>
        <img src={src} alt="" onError={fail} />
      </span>
    );
  }
  const initial = (name.trim()[0] ?? "?").toUpperCase();
  return (
    <span className="profile-avatar profile-avatar-initial" style={{ ...style, ["--avatar-hue" as string]: hueFor(name) }} aria-hidden>
      {initial}
    </span>
  );
}
