import type { CardAtlasEntry } from "../cards/atlas";
import { counterValueFor, formatCounter } from "../cards/counterValue";

const COLOR_HEX: Record<string, string> = {
  red: "#d6383a",
  green: "#2f9e5b",
  blue: "#2f7fd1",
  purple: "#8a4fc4",
  black: "#2b2b30",
  yellow: "#e8c32e",
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Fill for the cost badge: the card's colour, or hard-edged halves/thirds for a multicolour card. */
export function colorFill(colors: string[]): string {
  const hexes = colors.map((c) => COLOR_HEX[c.toLowerCase()]).filter((h): h is string => !!h);
  if (hexes.length === 0) return "#6b7480";
  if (hexes.length === 1) return hexes[0]!;
  const step = 360 / hexes.length;
  return `conic-gradient(from 0deg, ${hexes.map((h, i) => `${h} ${i * step}deg ${(i + 1) * step}deg`).join(", ")})`;
}

/** Cost (or life) in a colour-filled round badge, then colour, power, Counter, attribute and type. */
export function PreviewBadges({ entry }: { entry: CardAtlasEntry }) {
  const cv = counterValueFor(entry);
  const isLeader = entry.type.toLowerCase() === "leader";
  const colorNames = entry.colors.map(cap);
  const main = isLeader ? entry.life : entry.cost;
  const mainLabel = isLeader ? "Life" : "Cost";
  return (
    <ul className="preview-badges" aria-label="Card stats">
      {main != null ? (
        <li
          className="pb-cost"
          style={{ background: colorFill(entry.colors) }}
          title={`${mainLabel} ${main}`}
          aria-label={`${mainLabel} ${main}`}
        >
          <span aria-hidden>{main}</span>
        </li>
      ) : null}
      {colorNames.length ? (
        <li className="pb-color" title={`Colour ${colorNames.join("/")}`} aria-label={`Colour ${colorNames.join("/")}`}>
          {entry.colors.map((c) => (
            <i key={c} className="pb-pip" style={{ background: colorFill([c]) }} aria-hidden />
          ))}
          <span aria-hidden>{colorNames.join("/")}</span>
        </li>
      ) : null}
      {entry.power != null ? (
        <li className="pb-power" title={`Power ${entry.power}`} aria-label={`Power ${entry.power}`}>
          <span aria-hidden>{entry.power}</span>
        </li>
      ) : null}
      {cv && !cv.effectOnly ? (
        <li
          className="pb-counter"
          title={`Counter ${formatCounter(cv)}`}
          aria-label={`Counter ${formatCounter(cv)}`}
        >
          <span aria-hidden>{formatCounter(cv)}</span>
        </li>
      ) : null}
      {entry.attribute ? (
        <li className="pb-attr" title={`Attribute ${entry.attribute}`} aria-label={`Attribute ${entry.attribute}`}>
          <span aria-hidden>{entry.attribute}</span>
        </li>
      ) : null}
      {entry.type ? (
        <li className="pb-type" title={`Type ${cap(entry.type)}`} aria-label={`Type ${cap(entry.type)}`}>
          <span aria-hidden>{cap(entry.type)}</span>
        </li>
      ) : null}
    </ul>
  );
}
