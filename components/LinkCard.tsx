"use client";
import { useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import type { LinkMeta } from "@/lib/types";
import { useStore } from "@/lib/store";
import { useI18n } from "@/lib/i18n";
import { domainOf, isDirectImageUrl, parseHttpsUrl } from "@/lib/links";

export function CopyButton({ text, label }: { text: string; label?: string }) {
  const { t } = useI18n(); const [done, setDone] = useState(false);
  const copy = async () => { try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); } catch {} };
  return <button onClick={copy} aria-label={label ?? t("c.copy")} className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs text-muted hover:bg-line/60 hover:text-ink">{done ? <Check size={13} /> : <Copy size={13} />}{done ? t("c.copied") : (label ?? t("c.copy"))}</button>;
}

export function LinkCard({ link }: { link: LinkMeta }) {
  const { settings } = useStore(); const { t } = useI18n();
  const [shown, setShown] = useState(false); const [failed, setFailed] = useState(false);
  const u = parseHttpsUrl(link.url); if (!u) return null;
  const image = (link.isImage ?? isDirectImageUrl(u)) && settings.previews !== "block";
  const visible = image && (settings.previews === "allow" || shown);
  return (
    <div className="mt-2 overflow-hidden rounded-2xl bg-bg/60">
      {visible && !failed && /* eslint-disable-next-line @next/next/no-img-element */ <img src={u.href} alt="" referrerPolicy="no-referrer" loading="lazy" onError={() => setFailed(true)} className="max-h-64 w-full object-contain" />}
      <div className="space-y-1 p-3">
        {link.title && <p className="text-sm font-medium">{link.title}</p>}
        {link.description && <p className="text-xs text-muted">{link.description}</p>}
        <p className="text-sm font-medium">{domainOf(u.href)}</p>
        <p className="break-all text-xs text-muted">{u.href}</p>
        {visible && !failed && <p className="text-xs text-muted">{t("link.loaded", { domain: domainOf(u.href) })}</p>}
        <div className="-ms-2 flex flex-wrap items-center gap-1 pt-1">
          <CopyButton text={u.href} label={t("link.copy")} />
          <a href={u.href} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs text-muted hover:bg-line/60 hover:text-ink"><ExternalLink size={13} />{t("link.open")}</a>
          {image && !visible && <button onClick={() => setShown(true)} className="rounded-full px-2 py-1 text-xs text-accent hover:bg-line/60">{t("link.show")}</button>}
        </div>
      </div>
    </div>
  );
}
