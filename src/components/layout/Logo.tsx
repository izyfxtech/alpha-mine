function LogoMark({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <defs>
        <clipPath id="ew-left">
          <rect x="0" y="0" width="32" height="64" />
        </clipPath>
        <clipPath id="ew-right">
          <rect x="32" y="0" width="32" height="64" />
        </clipPath>
      </defs>
      <path
        d="M7 20 L19 56 L32 30 L45 56 L57 20"
        fill="none"
        strokeWidth="10"
        strokeLinejoin="miter"
        strokeMiterlimit="10"
        className="stroke-ink"
        clipPath="url(#ew-left)"
      />
      <path
        d="M7 20 L19 56 L32 30 L45 56 L57 20"
        fill="none"
        strokeWidth="10"
        strokeLinejoin="miter"
        strokeMiterlimit="10"
        className="stroke-profit"
        clipPath="url(#ew-right)"
      />
      <path d="M32 1 L37.5 8.5 L32 16 L26.5 8.5 Z" className="fill-profit" />
    </svg>
  );
}

export function Logo({ collapsed }: { collapsed?: boolean }) {
  if (collapsed) return <LogoMark />;
  return (
    <div className="flex items-center gap-2">
      <LogoMark />
      <span className="text-xl font-extrabold tracking-tight">
        <span className="text-ink">Edge</span>
        <span className="text-profit">Whiz</span>
      </span>
    </div>
  );
}
