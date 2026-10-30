import { useId } from "react";

/** The OPTCG Duel logo: a gold card behind a navy straw hat card. Fixed brand colours, the same in every theme. */
export function BrandMark({ className }: { className?: string }) {
  const clip = `brand-crown-${useId().replace(/:/g, "")}`;
  return (
    <svg className={className} viewBox="0 0 40 40" aria-hidden="true" focusable="false">
      <defs>
        <clipPath id={clip}>
          <path d="M19 38c0-11 5.8-18 13-18s13 7 13 18z" />
        </clipPath>
      </defs>
      <rect x="8" y="6" width="16" height="23" rx="2.5" fill="#a8853f" stroke="#e2b458" strokeWidth="1.4" transform="rotate(-14 16 17)" />
      <g transform="rotate(12 23 21)">
        <rect x="15" y="9" width="16" height="23" rx="2.5" fill="#16303b" stroke="#e2b458" strokeWidth="2" />
        <g transform="translate(23 21.5) scale(0.27) translate(-32 -31)">
          <path d="M19 38c0-11 5.8-18 13-18s13 7 13 18z" fill="#e2b458" />
          <rect x="17" y="32" width="30" height="6" fill="#b8322a" clipPath={`url(#${clip})`} />
          <rect x="8" y="37" width="48" height="5" rx="2.5" fill="#d9a441" />
        </g>
      </g>
    </svg>
  );
}

/** Logo plus "optcg" + gold "duel" wordmark, for topbars. */
export function BrandWordmark() {
  return (
    <>
      <BrandMark className="brand-mark" />
      <span className="brand-word">
        optcg<span>duel</span>
      </span>
    </>
  );
}
