export function BrandMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <rect x="14" y="5" width="36" height="54" rx="5" fill="#16303b" stroke="#e2b458" strokeWidth="3.5" />
      <rect x="20" y="15" width="9" height="9" rx="2" fill="#e2b458" />
      <path d="M22 19.6l2.2 2.2 3.4-4" fill="none" stroke="#16303b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="32" y="17.5" width="12" height="4" rx="2" fill="#efe6d2" />
      <rect x="20" y="27.5" width="9" height="9" rx="2" fill="#e2b458" />
      <path d="M22 32.1l2.2 2.2 3.4-4" fill="none" stroke="#16303b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="32" y="30" width="12" height="4" rx="2" fill="#efe6d2" />
      <rect x="20.75" y="40.75" width="7.5" height="7.5" rx="1.6" fill="none" stroke="#e2b458" strokeWidth="1.5" />
      <rect x="32" y="42.5" width="8" height="4" rx="2" fill="#efe6d2" opacity="0.55" />
    </svg>
  );
}

export function BrandWordmark() {
  return (
    <>
      <BrandMark className="brand-mark" />
      <b className="brand-wordmark">OPTCG</b>
    </>
  );
}
