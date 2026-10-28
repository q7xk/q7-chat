import type { Metadata } from "next";
import Link from "next/link";
import { LogoMark } from "@/components/Logo";

export const metadata: Metadata = {
  title: "Q7 Chat — Yardım ve Dokümantasyon",
  description: "Q7 Chat kullanım kılavuzu: bağlanma, sohbet, gizlilik ve sorun giderme.",
};

const H2 = ({ id, children }: { id: string; children: string }) => (
  <h2 id={id} className="scroll-mt-24 border-b border-line/60 pb-2 text-2xl font-semibold tracking-tight text-ink">{children}</h2>
);
const P = ({ children }: { children: React.ReactNode }) => <p className="leading-relaxed text-muted">{children}</p>;
const UL = ({ children }: { children: React.ReactNode }) => <ul className="list-disc space-y-2 ps-6 leading-relaxed text-muted">{children}</ul>;
const LI = ({ b, children }: { b: string; children: string }) => <li><strong className="font-medium text-ink">{b}</strong> {children}</li>;

export default function HelpPage() {
  return (
    <div className="min-h-dvh bg-bg text-ink">
      <header className="border-b border-line/60 bg-panel">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-6 py-4">
          <Link href="/" className="inline-flex items-center gap-2.5 rounded-2xl bg-pc px-4 py-2 text-onpc">
            <LogoMark size={24} />
            <span className="text-base font-semibold tracking-tight">Q7 Chat</span>
          </Link>
          <nav className="flex items-center gap-2 text-sm">
            <Link href="/learn" className="rounded-full bg-highest px-4 py-2 text-ink hover:bg-container">Eğitim</Link>
            <Link href="/" className="rounded-full bg-sc px-4 py-2 text-onsc hover:brightness-110">Uygulamaya dön</Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-12 px-6 py-10">
        <div className="space-y-3">
          <h1 className="text-4xl font-semibold tracking-tight">Yardım ve Dokümantasyon</h1>
          <p className="text-lg text-muted">Q7 Chat; uçtan uca şifreli, cihazında yaşayan bir mesajlaşma uygulamasıdır. Bu sayfa her özelliğin nasıl çalıştığını ve sorun çıktığında ne yapacağını anlatır.</p>
        </div>

        <div className="rounded-[28px] bg-panel p-6 space-y-3">
          <p className="text-sm font-medium">İçindekiler</p>
          <ol className="grid gap-2 text-sm text-muted sm:grid-cols-2">
            {[
              ["#nedir", "Q7 Chat nedir?"], ["#baslangic", "Hızlı başlangıç"], ["#baglanma", "Bağlanmanın yolları"],
              ["#sohbet", "Sohbet özellikleri"], ["#gizlilik", "Gizlilik ve güvenlik"],
              ["#durum", "Durum ve bildirimler"], ["#sorunlar", "Bağlantı sorunları"], ["#veriler", "Verilerin ve yedekler"],
              ["#sss", "Sık sorulan sorular"],
            ].map(([h, l]) => <li key={h}><a href={h} className="text-accent hover:underline">{l}</a></li>)}
          </ol>
        </div>

        <section className="space-y-4">
          <H2 id="nedir">Q7 Chat nedir?</H2>
          <P>Q7 Chat, iki cihaz arasında doğrudan (P2P) çalışan bir mesajlaşma uygulamasıdır. Mesajların bir sunucuda birikmez: cihazlar birbirini bulun ve mesajlar yalnızca uçtan uca şifrelenmiş olarak taşınır. Uygulama sunucusuz çalışabildiği için hesap da e-posta da yoktur — kimliğin, cihazında üretilen 12 haneli bir <strong className="text-ink">Q7 kodudur</strong>.</P>
          <P>İki sohbet türü vardır: <strong className="text-ink">Kişiler</strong> ile kurulan uçtan uca şifreli sohbetler ve sadece senin cihazında duran <strong className="text-ink">Yerel notlar</strong> sohbetleri.</P>
        </section>

        <section className="space-y-4">
          <H2 id="baslangic">Hızlı başlangıç</H2>
          <ol className="list-decimal space-y-2 ps-6 leading-relaxed text-muted">
            <li>Uygulamayı aç; ilk açılışta <strong className="text-ink">Q7 kodun</strong> otomatik üretilir (Bağlan sekmesinden görürsün).</li>
            <li>Kodunu paylaş veya karşı tarafın kodunu/QR'ını ekle.</li>
            <li>İstek karşılıklı onaylanınca Sohbetler'de sohbet açılır; yazmaya başla.</li>
          </ol>
        </section>

        <section className="space-y-4">
          <H2 id="baglanma">Bağlanmanın yolları</H2>
          <UL>
            <LI b="Kod ile:">Bağlan sekmesinde 12 haneli kodu gir ve "Bağlan" de.</LI>
            <LI b="QR ile:">Aynı ağda ya da yüz yüze QR okutarak tek adımda eşleş.</LI>
            <LI b="Davet dosyası:">Bağlantı kurulamayan ortamlarda (.offline) davet dosyasını paylaş; karşı taraf içe aktarınca eşleşme tamamlanır.</LI>
            <LI b="Bağlantı istekleri:">Sana bağlanmak isteyenler "Bağlantı istekleri" listesine düşer; kabul ya da reddedersin. Engellenenler sessizce yoksayılır.</LI>
            <LI b="Yalnızca kişilerim:">Erişim kısıtlamaları ayarını açarsan, listen olmayanların istekleri hiçbir zaman sana ulaşmaz.</LI>
          </UL>
        </section>

        <section className="space-y-4">
          <H2 id="sohbet">Sohbet özellikleri</H2>
          <UL>
            <LI b="Mesajlar:">Metin, bağlantı önizlemesi, yanıt Alma ve 72 saatlik ömür.</LI>
            <LI b="Emoji:">20 kategoride 1500+ emoji; arama çubuğuyla hızlı bul.</LI>
            <LI b="GIF:">GIF paneli ile hareketli yanıtlar.</LI>
            <LI b="Dosya ve görsel:">Fotoğraf, belge ve sesli mesaj gönder.</LI>
            <LI b="Anket:">Tek ya da çok seçimli anket kur; oylar canlı güncellenir.</LI>
            <LI b="Etkinlik ve konum:">Tarih/yer bildiren etkinlik kartı ya da konum paylaş.</LI>
            <LI b="Sohbet menüsü:">Sabitleme, sessize alma, arşiv, duvar kâğıdı ve sohbeti silme.</LI>
          </UL>
        </section>

        <section className="space-y-4">
          <H2 id="gizlilik">Gizlilik ve güvenlik</H2>
          <UL>
            <LI b="Uçtan uca şifreleme:">Mesajlar yalnızca iki cihazın bildiği anahtarlarla şifrelenir; röleler içeriği okuyamaz.</LI>
            <LI b="Güvenlik numarası:">Kişi kartındaki parmak izini karşı tarafla karşılaştır; eşleşiyorsa araya kimse girmemiştir.</LI>
            <LI b="72 saat:">Mesajlar gönderildikten 72 saat sonra cihazlardan otomatik silinir.</LI>
            <LI b="Cihazda saklanır:">Sohbetler tarayıcının yerel deposunda yaşar; sunucuda kopyası yoktur.</LI>
            <LI b="Engelleme:">Kişiyi engellemek onun seni aramasını, yazmasını ve bağlanmasını tamamen keser.</LI>
            <LI b="Harici görseller:">Bağlantı önizlemelerini "önce sor / asla / her zaman" olarak sınırlayabilirsin.</LI>
          </UL>
        </section>

        <section className="space-y-4">
          <H2 id="durum">Durum ve bildirimler</H2>
          <P>Üst bardaki kapsülle durumunu seç: <strong className="text-ink">Çevrimiçi</strong>, <strong className="text-ink">Rahatsız etmeyin</strong> (bildirimleri susturur) veya <strong className="text-ink">Boşta</strong>. Ayarlar ▸ Bildirimler'den sekme arka plandayken sistem bildirimi, ses ve önizlemeyi açıp kapatabilirsin.</P>
        </section>

        <section className="space-y-4">
          <H2 id="sorunlar">Bağlantı sorunları</H2>
          <UL>
            <LI b="Bağlanıyor kalıyor:">İki taraf da uygulamayı açık tutmalı; cihaz her 30 saniyede bir "yaşıyorum" sinyali gönderir. Sinyal gelmezse durum çevrimdışına düşer.</LI>
            <LI b="Aynı ağda değilsek:">Uygulama ortak röleler üzerinden buluşmayı dener; kurumsal ağlarda TURN ayarı gerekebilir (Ayarlar ▸ Genel ▸ Röle ve ağ).</LI>
            <LI b="Röle kapatılmış:">Röleler kapalıyken yalnızca QR ve davet dosyası ile eşleşme çalışır.</LI>
            <LI b="Kod bulunamadı:">Kodu tek tek karşılaştır; 12 hane eksiksiz olmalı.</LI>
          </UL>
        </section>

        <section className="space-y-4">
          <H2 id="veriler">Verilerin ve yedekler</H2>
          <P>Her şey cihazındadır. Ayarlar ▸ Veri gizliliği'nden tüm sohbetlerini ve ayarlarını tek JSON dosyası olarak yedekleyebilir, başka cihazda içe aktarabilir ya da <strong className="text-ink">her şeyi sil</strong> ile sıfırdan başlayabilirsin. Yedek dosyası şifrelidir; yalnızca Q7 Chat geri yükleyebilir.</P>
        </section>

        <section className="space-y-4">
          <H2 id="sss">Sık sorulan sorular</H2>
          <div className="space-y-4">
            {[
              ["Şifremi unutursam?", "Şifre yok — anahtarların cihazında. Cihaz verisini silersen eski sohbetlere erişilemez; yedek alırsan ondan geri gelirsin."],
              ["Mesajlar neden 72 saatte siliniyor?", "Gizlilik varsayılanı: uzun ömürlü arşiv yerine taze konuşma. İstediğin an yedek alıp saklayabilirsin."],
              ["İki cihazda aynı hesap?", "Hesap cihaza bağlıdır; kodu ikinci cihaza eşleyerek kişilerinle yeniden bağlanabilirsin."],
              ["Biri beni rahatsız ediyor?", "Kişisini aç ve Engelle; erişim kısıtlamalarını da açarsan yabancıların istekleri hiç gelmez."],
              ["Grup sohbeti var mı?", "Şu an Q7 Chat birebir sohbetlere odaklıdır; gruplar yol haritasında."],
            ].map(([q, a]) => (
              <div key={q} className="rounded-3xl bg-panel p-5">
                <p className="font-medium text-ink">{q}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">{a}</p>
              </div>
            ))}
          </div>
        </section>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line/60 pt-6 text-sm">
          <p className="text-muted">Q7 Chat · Yardım</p>
          <nav className="flex gap-2">
            <Link href="/learn" className="rounded-full bg-highest px-4 py-2 hover:bg-container">Eğitim sayfası</Link>
            <Link href="/" className="rounded-full bg-sc px-4 py-2 text-onsc hover:brightness-110">Uygulamaya dön</Link>
          </nav>
        </footer>
      </main>
    </div>
  );
}
