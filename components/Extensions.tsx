"use client";
import { useEffect, useState } from "react";
import {
  Boxes, Check, ExternalLink, Gamepad2, Globe, Mail, Shield,
  Sparkles, ToggleLeft, ToggleRight, X, Play, RefreshCw
} from "lucide-react";
import { Box, Page } from "./ui";
import { btn } from "./Connect";
import { cn } from "@/lib/cn";

interface ExtensionItem {
  id: string;
  name: string;
  description: string;
  category: "workspace" | "security" | "office" | "gaming";
  iconBg: string;
  isGame?: boolean;
}

const EXTENSIONS: ExtensionItem[] = [
  {
    id: "google",
    name: "Google Entegrasyonu",
    description: "Google Workspace ile uyumla çalışması",
    category: "workspace",
    iconBg: "bg-blue-500/15 text-blue-500",
  },
  {
    id: "proton",
    name: "Proton Entegrasyonu",
    description: "Proton ile uyumla çalışması",
    category: "security",
    iconBg: "bg-purple-500/15 text-purple-500",
  },
  {
    id: "microsoft",
    name: "Microsoft Entegrasyonu",
    description: "Microsoft office ile uyumla çalışır",
    category: "office",
    iconBg: "bg-amber-500/15 text-amber-500",
  },
  {
    id: "tuta",
    name: "Tuta Entegrasyonu",
    description: "Tutanota ile uyumla çalışması",
    category: "security",
    iconBg: "bg-red-500/15 text-red-500",
  },
  {
    id: "doom",
    name: "Doom",
    description: "Can it run doom? yes!",
    category: "gaming",
    iconBg: "bg-red-600/20 text-red-500",
    isGame: true,
  },
];

export function ExtensionsPanel() {
  const [enabledExts, setEnabledExts] = useState<Record<string, boolean>>({});
  const [activeModal, setActiveModal] = useState<string | null>(null);
  const [doomPlaying, setDoomPlaying] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("q7_extensions");
      if (stored) setEnabledExts(JSON.parse(stored));
    } catch {}
  }, []);

  const toggleExtension = (id: string) => {
    setEnabledExts((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try {
        localStorage.setItem("q7_extensions", JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const getIcon = (item: ExtensionItem) => {
    switch (item.id) {
      case "google":
        return <Globe size={22} />;
      case "proton":
        return <Shield size={22} />;
      case "microsoft":
        return <Boxes size={22} />;
      case "tuta":
        return <Mail size={22} />;
      case "doom":
        return <Gamepad2 size={22} />;
      default:
        return <Sparkles size={22} />;
    }
  };

  return (
    <Page title="Eklentiler" className="stagger">
      {/* Tanıtım / Bilgilendirme */}
      <Box className="space-y-3">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-pc text-onpc">
            <Boxes size={22} />
          </span>
          <div>
            <h2 className="text-base font-semibold text-ink">Eklentiler & Entegrasyonlar</h2>
            <p className="text-xs text-muted">
              Q7 Chat deneyiminizi favori ofis ve gizlilik araçlarınızla entegre edin.
            </p>
          </div>
        </div>
      </Box>

      {/* Eklentiler Listesi */}
      <div className="grid gap-3 sm:grid-cols-1">
        {EXTENSIONS.map((item) => {
          const isEnabled = !!enabledExts[item.id];
          return (
            <Box key={item.id} className="transition-all duration-200 hover:border-line">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <span className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl", item.iconBg)}>
                    {getIcon(item)}
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-ink">{item.name}</p>
                      {item.isGame ? (
                        <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-red-500 uppercase">
                          Oyun
                        </span>
                      ) : isEnabled ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-accent/20 px-2 py-0.5 text-[11px] font-medium text-accent">
                          <Check size={11} />
                          Etkin
                        </span>
                      ) : (
                        <span className="rounded-full bg-highest px-2 py-0.5 text-[11px] font-medium text-muted">
                          Devre Dışı
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-muted">{item.description}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {item.isGame ? (
                    <button
                      onClick={() => setDoomPlaying(true)}
                      className={cn(btn, "bg-red-600 text-white hover:bg-red-700 shadow-sm gap-2")}
                    >
                      <Play size={15} className="fill-current" />
                      Oyunu Başlat
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => setActiveModal(item.id)}
                        className={cn(btn, "bg-sc text-onsc text-xs px-3.5 py-2")}
                      >
                        Ayrıntılar
                      </button>
                      <button
                        onClick={() => toggleExtension(item.id)}
                        className={cn(
                          "m3-press flex items-center gap-1 rounded-full px-3.5 py-2 text-xs font-medium transition-colors",
                          isEnabled ? "bg-accent text-bg" : "bg-highest text-muted hover:text-ink"
                        )}
                      >
                        {isEnabled ? (
                          <>
                            <ToggleRight size={18} />
                            Etkin
                          </>
                        ) : (
                          <>
                            <ToggleLeft size={18} />
                            Etkinleştir
                          </>
                        )}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </Box>
          );
        })}
      </div>

      {/* DOOM Modal / Tam Ekran Oynatıcı */}
      {doomPlaying && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-md">
          <div className="relative flex h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-[28px] border border-line/40 bg-zinc-950 shadow-2xl">
            {/* Doom Modal Başlık Çubuğu */}
            <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900 px-5 py-3">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-red-600 text-white">
                  <Gamepad2 size={18} />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-white tracking-wide">DOOM (1993)</h3>
                  <p className="text-[11px] text-zinc-400">Can it run doom? YES!</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const iframe = document.getElementById("doom-iframe") as HTMLIFrameElement;
                    if (iframe) iframe.src = iframe.src;
                  }}
                  title="Yeniden Başlat"
                  className="rounded-full p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white"
                >
                  <RefreshCw size={16} />
                </button>
                <button
                  onClick={() => setDoomPlaying(false)}
                  title="Kapat"
                  className="rounded-full p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Doom Oyun Alanı (Iframe Web Dosbox / JS-DOS) */}
            <div className="relative flex-1 bg-black">
              <iframe
                id="doom-iframe"
                src="https://dos.zone/player/?bundleUrl=https%3A%2F%2Fcdn.dos.zone%2Fcustom%2Fdos%2Fdoom.jsdos"
                title="DOOM"
                allow="autoplay; fullscreen; keyboard; gamepad"
                className="h-full w-full border-0"
              />
            </div>

            {/* Doom Alt Bilgi / Kontroller */}
            <div className="flex items-center justify-between border-t border-zinc-800 bg-zinc-900 px-5 py-2.5 text-xs text-zinc-400">
              <span>Kontroller: Ok tuşları / WASD ile hareket · Boşluk / Ctrl ile ateş · Enter</span>
              <button
                onClick={() => setDoomPlaying(false)}
                className="rounded-lg bg-zinc-800 px-3 py-1 font-medium text-white hover:bg-zinc-700"
              >
                Çıkış
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Entegrasyon Ayrıntıları Modalı */}
      {activeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="m3-fade w-full max-w-md space-y-4 rounded-[28px] bg-panel p-6 shadow-2xl border border-line">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className={cn("flex h-10 w-10 items-center justify-center rounded-xl", EXTENSIONS.find((x) => x.id === activeModal)?.iconBg)}>
                  {getIcon(EXTENSIONS.find((x) => x.id === activeModal)!)}
                </span>
                <div>
                  <h3 className="text-base font-semibold text-ink">
                    {EXTENSIONS.find((x) => x.id === activeModal)?.name}
                  </h3>
                  <p className="text-xs text-muted">
                    {EXTENSIONS.find((x) => x.id === activeModal)?.description}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setActiveModal(null)}
                className="rounded-full p-1.5 text-muted hover:bg-container hover:text-ink"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3 rounded-2xl bg-highest p-4 text-xs leading-relaxed text-muted">
              <p>
                Bu eklenti etkinleştirildiğinde Q7 Chat, güvenli ve şifreli veri akışını koruyarak bu servis ile entegre çalışır.
              </p>
              <ul className="list-disc space-y-1 ps-4 text-ink">
                <li>Uçtan uca şifreleme ve sıfır-bilgi gizlilik standardı korunur.</li>
                <li>Yerel depolama dışına yetkisiz veri aktarımı yapılmaz.</li>
                <li>Bildirimler ve senkronizasyon otomatik olarak yapılandırılır.</li>
              </ul>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => {
                  toggleExtension(activeModal);
                  setActiveModal(null);
                }}
                className={cn(
                  btn,
                  enabledExts[activeModal] ? "bg-sc text-onsc" : "bg-accent text-bg"
                )}
              >
                {enabledExts[activeModal] ? "Devre Dışı Bırak" : "Etkinleştir"}
              </button>
              <button
                onClick={() => setActiveModal(null)}
                className={cn(btn, "bg-container text-ink")}
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}
    </Page>
  );
}
