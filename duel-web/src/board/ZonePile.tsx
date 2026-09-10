import { DON_CARD_ART } from "./donArt";

type Props = {
  label: string;
  count: number;
  variant?: "life" | "deck" | "don" | "trash";
  secret?: boolean;
};

export function ZonePile({ label, count, variant = "deck", secret }: Props) {
  return (
    <div className={`zone-pile zone-pile-${variant}`} title={`${label}: ${count}`}>
      <div className="zone-pile-stack" aria-hidden>
        <span className="zone-pile-face" />
        <span className="zone-pile-face mid" />
        {variant === "don" ? (
          <img className="zone-pile-face top don-pile-art" src={DON_CARD_ART} alt="" />
        ) : (
          <span className="zone-pile-face top" />
        )}
      </div>
      <div className="zone-pile-meta">
        <span className="zone-pile-label">{label}</span>
        <span className="zone-pile-count">{secret ? "??" : count}</span>
      </div>
    </div>
  );
}
