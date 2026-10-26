/** Q7 Message logo: inline speech-bubble glyph + wordmark. No external assets. */
export function Logo() {
  return (
    <div className="inline-flex items-center gap-2.5 rounded-3xl rounded-es-md bg-pc px-4 py-2.5 text-onpc">
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden className="h-[26px] w-[26px]">
        <path d="M12 3c5 0 9 3.6 9 8.2 0 4.6-4 8.2-9 8.2-1 0-2-.1-2.9-.4L4.6 21a.7.7 0 0 1-1-.8l1.2-3.2C3.3 15.6 3 13.5 3 11.2 3 6.6 7 3 12 3Z" fill="currentColor" opacity=".95" />
        <circle cx="8.4" cy="11.4" r="1.35" fill="rgb(var(--pc))" /><circle cx="12" cy="11.4" r="1.35" fill="rgb(var(--pc))" /><circle cx="15.6" cy="11.4" r="1.35" fill="rgb(var(--pc))" />
      </svg>
      <span className="text-lg font-semibold tracking-tight">Q7 Message</span>
    </div>
  );
}
