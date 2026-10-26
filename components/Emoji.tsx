"use client";
import { useEffect, useState } from "react";
import * as db from "@/lib/db";
import { useI18n, type K } from "@/lib/i18n";
import { cn } from "@/lib/cn";

const SETS: { id: K; list: string }[] = [
  { id: "emoji.smileys", list: "😀 😃 😄 😁 😆 😅 😂 🤣 🙂 😉 😊 😇 🥰 😍 🤩 😘 😋 😛 🤪 🤔 🤗 😎 🥳 😏 😒 😔 😢 😭 😤 😡 😱 😴 🤯 🥺" },
  { id: "emoji.gestures", list: "👍 👎 👌 ✌️ 🤞 🤟 🤘 👏 🙌 🙏 👋 🤝 💪 👀 🫶 ✋ 👊 🤙 ☝️ 👉 👈 🫡" },
  { id: "emoji.hearts", list: "❤️ 🧡 💛 💚 💙 💜 🖤 🤍 💔 💕 💖 💯 ✨ ⭐ 🔥 🎉 🎁 ✅ ❌ ❓ ❗ 💡" },
  { id: "emoji.animals", list: "🐶 🐱 🐭 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐸 🐵 🐔 🐧 🦄 🐝 🦋 🌸 🌹 🌻 🌲 🌍 🌙 ☀️ 🌈 ⛄" },
  { id: "emoji.food", list: "🍎 🍌 🍇 🍓 🍉 🍕 🍔 🍟 🌮 🍣 🍜 🍰 🍪 🍫 🍿 ☕ 🍵 🍺 🍷 🥂 🎂 🍦" },
];

export function EmojiPicker({ onPick }: { onPick: (e: string) => void }) {
  const { t } = useI18n();
  const [recent, setRecent] = useState<string[]>([]);
  const [tab, setTab] = useState<K>("emoji.recent");
  useEffect(() => { db.getFlag("emoji-recent").then((v) => { if (Array.isArray(v)) { setRecent(v.filter((x) => typeof x === "string").slice(0, 30)); if (v.length === 0) setTab("emoji.smileys"); } else setTab("emoji.smileys"); }).catch(() => setTab("emoji.smileys")); }, []);
  const pick = (e: string) => {
    onPick(e);
    const next = [e, ...recent.filter((x) => x !== e)].slice(0, 30); setRecent(next); void db.setFlag("emoji-recent", next).catch(() => {});
  };
  const tabs: K[] = ["emoji.recent", ...SETS.map((s) => s.id)];
  const list = tab === "emoji.recent" ? recent : SETS.find((s) => s.id === tab)!.list.split(" ");
  return (
    <div className="mb-2 rounded-3xl bg-highest p-3">
      <div className="mb-2 flex gap-1 overflow-x-auto" role="tablist">
        {tabs.map((k) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cn("shrink-0 rounded-full px-3 py-1.5 text-xs font-medium", tab === k ? "bg-pc text-onpc" : "text-muted hover:bg-container")}>{t(k)}</button>)}
      </div>
      <div className="flex max-h-40 flex-wrap gap-0.5 overflow-y-auto scroll-thin" role="group">
        {list.map((e) => <button key={e} onClick={() => pick(e)} className="rounded-xl px-2 py-1 text-2xl hover:bg-container">{e}</button>)}
      </div>
    </div>
  );
}
