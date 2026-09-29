/** Line-art compass rose for empty states; inherits `color`. */
export function CompassIcon() {
  return (
    <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <circle cx="24" cy="24" r="20" />
      <circle cx="24" cy="24" r="15" strokeDasharray="1.5 3" />
      <path d="M24 6l3.5 14.5L42 24l-14.5 3.5L24 42l-3.5-14.5L6 24l14.5-3.5z" fill="currentColor" fillOpacity="0.15" />
      <path d="M24 6v36M6 24h36" strokeOpacity="0.5" />
    </svg>
  );
}

/** Small sailing ship for the group-buy ("crew order") empty state. */
export function ShipIcon() {
  return (
    <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true">
      <path d="M24 6v28" />
      <path d="M24 8c7 3 11 9 11 18H24z" fill="currentColor" fillOpacity="0.15" />
      <path d="M24 12c-5 2-8 7-8 14h8z" fill="currentColor" fillOpacity="0.1" />
      <path d="M8 32h32l-4 7H12z" />
      <path d="M4 43c3 0 3-2 6-2s3 2 6 2 3-2 6-2 3 2 6 2 3-2 6-2 3 2 6 2" strokeLinecap="round" />
    </svg>
  );
}
