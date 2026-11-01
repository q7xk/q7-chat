/** Q7 Chat logo: using public/logo.svg */
export function LogoMark({ size = 26, className }: { size?: number; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/logo.svg"
      alt="Q7 Chat"
      width={size}
      height={size}
      className={className}
      style={{ width: size, height: size, objectFit: "contain" }}
    />
  );
}

export function Logo({ size = 32 }: { size?: number }) {
  return (
    <div className="inline-flex items-center gap-2.5 rounded-3xl bg-panel px-4 py-2 text-ink shadow-sm border border-line/40">
      <LogoMark size={size} />
      <span className="text-lg font-semibold tracking-tight">Q7 Chat</span>
    </div>
  );
}
