/** Simple geometric mark: a signal meter in a rounded square. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 28 28" className={className ?? "size-7"}>
      <rect width="28" height="28" rx="7" className="fill-ink-800" />
      <rect x="0.5" y="0.5" width="27" height="27" rx="6.5" className="fill-none stroke-ink-600" />
      <rect x="7" y="14" width="3" height="7" rx="1" className="fill-signal-500" />
      <rect x="12.5" y="10" width="3" height="11" rx="1" className="fill-signal-400" />
      <rect x="18" y="7" width="3" height="14" rx="1" className="fill-signal-300" />
    </svg>
  );
}
