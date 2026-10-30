export function LogoMark({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <path d="M26 4 L32 12 L26 20 L20 12 Z" className="fill-profit" />
      <path d="M22 22 L4 58 H14 L30 26 Z" className="fill-ink" />
      <path d="M32 26 L50 58 H60 L40 22 Z" className="fill-profit" />
    </svg>
  );
}

export function Logo({ collapsed }: { collapsed?: boolean }) {
  if (collapsed) return <LogoMark />;
  return (
    <div className="flex items-center gap-2">
      <LogoMark />
      <span className="text-xl font-extrabold tracking-tight">
        <span className="text-ink">Alpha</span>
        <span className="text-profit">Mine</span>
      </span>
    </div>
  );
}
