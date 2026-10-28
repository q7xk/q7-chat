import type { Metadata } from "next";
import Link from "next/link";
import { LogoMark } from "@/components/Logo";

export const metadata: Metadata = {
  title: "Q7 Chat — Eğitim",
  description: "Q7 Chat adım adım eğitim: ilk bağlantıdan gizliliğe ve yedeklemeye kadar dersler.",
};

const lessons: { no: string; title: string; goal: string; steps: string[]; tip?: string }[] = [
  {
    no: "1", title: "İlk açılış ve kodun", goal: "Uygulamayı tanı ve kimliğinin ne olduğunu öğren.",
    steps: [
      "Uygulamayı aç; sol üstteki menüden Bağlan sekmesine git.",
      "12 haneli Q7 kodunu gör: bu senin adresindir, parolan değildir.",
      "Kodunu kopyala; paylaşmaktan çekinme — her istek yine de senin onayına düşer.",
    ],
    tip: "Kod bir adres gibidir. Bilen biri sana bağlantı isteği gönderebilir; kabul etmek her zaman sana kalmış.",
  },
  {
    no: "2", title: "İlk kişini ekle", goal: "Bir arkadaşınla uçtan uca şifreli sohbet kur.",
    steps: [
      "Aynı odadaysanız: Bağlan ▸ QR ile birbirinizi okutun.",
      "Uzaktaysanız: kodunu söyle, o da Bağlan ▸ Kodla ekle'den seni eklesin.",
      "İstek iki tarafta da onaylanınca sohbet otomatik açılır.",
      "Güvenlik için kişi kartındaki parmak izini iki tarafta karşılaştırın.",
    ],
  },
  {
    no: "3", title: "Sohbetin tüm yolları", goal: "Yazı dışındaki zengin içerikleri keşfet.",
    steps: [
      "Mesaj kutusunun yanındaki artıdan dosya, konum, anket veya etkinlik ekle.",
      "Emoji butonuyla 20 kategorili seçiciyi aç; aramadan hızlı bul.",
      "GIF panelinden hareketli yanıt gönder.",
      "Mikrofonla sesli mesaj kaydet; tuşa basılı tut, bırak, gönder.",
    ],
    tip: "Bir mesaja uzun basarak yanıtlayabilirsin; yanıt orijinalin üstünde görünür.",
  },
  {
    no: "4", title: "Gizlilik ayarların", goal: "Kimin sana ulaşabildiğini sen yönet.",
    steps: [
      "Ayarlar ▸ Erişim kısıtlamaları: yalnızca kişilerin bağlanabilsin.",
      "Rahatsız eden kişiyi Engelle; artık yazamaz, arayamaz, bağlanamaz.",
      "Ayarlar ▸ Bildirimler: sekme arka plandayken bildirim, ses ve önizlemeyi ayarla.",
      "Üst bardaki durum kapsülüyle Çevrimiçi / Rahatsız etmeyin / Boşta seç.",
    ],
  },
  {
    no: "5", title: "Verilerini yönetmek", goal: "Yedekle, taşı, sil.",
    steps: [
      "Ayarlar ▸ Veri gizliliği ▸ Dışa aktar: tek JSON yedek dosyası al.",
      "Yeni cihazda İçe aktar ile her şeyi geri yükle.",
      "Her şeyi sil ile cihazındaki tüm Q7 verisini yok et.",
    ],
    tip: "Mesajlar 72 saatte kendiliğinden silinir; kalıcı arşiv istiyorsan düzenli yedek al.",
  },
];

export default function LearnPage() {
  return (
    <div className="min-h-dvh bg-bg text-ink">
      <header className="border-b border-line/60 bg-panel">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-6 py-4">
          <Link href="/" className="inline-flex items-center gap-2.5 rounded-2xl bg-pc px-4 py-2 text-onpc">
            <LogoMark size={24} />
            <span className="text-base font-semibold tracking-tight">Q7 Chat</span>
          </Link>
          <nav className="flex items-center gap-2 text-sm">
            <Link href="/help" className="rounded-full bg-highest px-4 py-2 text-ink hover:bg-container">Yardım</Link>
            <Link href="/" className="rounded-full bg-sc px-4 py-2 text-onsc hover:brightness-110">Uygulamaya dön</Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-10 px-6 py-10">
        <div className="space-y-3">
          <h1 className="text-4xl font-semibold tracking-tight">Eğitim</h1>
          <p className="text-lg text-muted">Altı kısa dersle Q7 Chat'in tamamı. Her ders birkaç dakika sürer; uygulamayı açık tutup adım adım deneyebilirsin.</p>
        </div>

        <div className="space-y-6">
          {lessons.map((l) => (
            <section key={l.no} className="rounded-[28px] bg-panel p-6 space-y-4">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-pc text-lg font-semibold text-onpc">{l.no}</span>
                <div>
                  <h2 className="text-xl font-semibold tracking-tight">{l.title}</h2>
                  <p className="text-sm text-muted">{l.goal}</p>
                </div>
              </div>
              <ol className="list-decimal space-y-2 ps-6 leading-relaxed text-muted">
                {l.steps.map((s) => <li key={s}>{s}</li>)}
              </ol>
              {l.tip && <p className="rounded-2xl bg-tc px-4 py-3 text-sm leading-relaxed text-ontc">💡 {l.tip}</p>}
            </section>
          ))}
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line/60 pt-6 text-sm">
          <p className="text-muted">Q7 Chat · Eğitim</p>
          <nav className="flex gap-2">
            <Link href="/help" className="rounded-full bg-highest px-4 py-2 hover:bg-container">Yardım sayfası</Link>
            <Link href="/" className="rounded-full bg-sc px-4 py-2 text-onsc hover:brightness-110">Uygulamaya dön</Link>
          </nav>
        </footer>
      </main>
    </div>
  );
}
