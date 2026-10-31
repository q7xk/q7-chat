# Q7 Chat

**72 saat sonra kaybolan, sunucusuz ve uçtan uca şifreli mesajlaşma.**

Q7 Chat; Next.js, TypeScript ve Tailwind CSS ile geliştirilmiş, tarayıcıda çalışan bir mesajlaşma uygulamasıdır. Hesap sistemi, uygulama sunucusu ve bulutta mesaj veritabanı yoktur: kimlik anahtarları, sohbetler ve ekler tarayıcının IndexedDB deposunda kalır; mesajlar doğrudan cihazlar arasında ya da halka açık MQTT röleleri üzerinden mühürlü zarflar hâlinde taşınır.

[English](README.md) · [Türkçe](README.tr.md)

<p>
  <img alt="Next.js" src="https://img.shields.io/badge/Next.js-14-black?logo=next.js" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white" />
  <img alt="Tailwind CSS" src="https://img.shields.io/badge/Tailwind_CSS-3-06B6D4?logo=tailwindcss&logoColor=white" />
  <img alt="Lisans: MPL 2.0" src="https://img.shields.io/badge/license-MPL--2.0-blue" />
</p>

> [!WARNING]
> Q7 Chat deneysel bir referans uygulamasıdır; **bağımsız güvenlik denetiminden geçmiş bir mesajlaşma uygulaması değildir**. Kriptografik protokol özel olarak tasarlanmıştır. Hayati, hukuki, tıbbi veya yüksek riskli iletişim için güvenmeyin. Gerçek verilerle kullanmadan önce [SECURITY.md](SECURITY.md) dosyasını okuyun.

---

## İçindekiler

- [Neden Q7 Chat?](#neden-q7-chat)
- [Özellikler](#özellikler)
- [Nasıl çalışır?](#nasıl-çalışır)
- [Güvenlik ve gizlilik modeli](#güvenlik-ve-gizlilik-modeli)
- [Teknoloji yığını](#teknoloji-yığını)
- [Başlangıç](#başlangıç)
- [Komutlar](#komutlar)
- [Dağıtım](#dağıtım)
- [Proje yapısı](#proje-yapısı)
- [Çok dillilik](#çok-dillilik)
- [Testler](#testler)
- [Sınırlar ve yol haritası](#sınırlar-ve-yol-haritası)
- [Katkı](#katkı)
- [Güvenlik bildirimleri](#güvenlik-bildirimleri)
- [Gizlilik](#gizlilik)
- [Lisans](#lisans)
- [Teşekkür](#teşekkür)

---

## Neden Q7 Chat?

Çoğu mesajlaşma uygulaması bir sunucuya güvenmenizi ister. Q7 Chat farklı bir varsayımla kurulmuştur:

- **Hesap yok, kayıt yok, e-posta yok.** Kimliğiniz cihazınızda üretilen bir anahtar çiftidir. Herkese açık adresiniz 12 haneli Q7 kodunuzdur.
- **Uygulama sunucusu yok.** Halka açık MQTT broker'ları yalnızca şifreli metin taşıyan aptal röleler olarak kullanılır. Broker'lar hash'lenmiş konuları ve şifreli metni görür; düz metni asla.
- **Yerel öncelikli depolama.** Sohbetler, kişiler, ayarlar ve dosyalar IndexedDB'de kalır. Bulut senkronizasyonu yoktur.
- **72 saatlik mesajlar.** Her mesaj oluşturulurken bir son kullanma zamanı alır. Süresi dolan mesajlar arayüzden filtrelenir ve IndexedDB'den silinir.
- **Mümkün olduğunca doğrudan.** Cihazlar WebRTC ile doğrudan konuşur. Bu mümkün değilse şifreli çerçeveler röle posta kutusuna düşer ve karşı taraf çevrimiçi olduğunda teslim edilir.
- **MPL 2.0 ile açık kaynak.** Kodu inceleyebilir, değiştirebilir ve kendiniz barındırabilirsiniz.

## Özellikler

### Mesajlaşma

- **Yerel notlar** — yalnızca cihazınızda kalan, kendinize notlar sohbeti.
- **Birebir P2P sohbetler** — kişilerle uçtan uca şifreli görüşmeler.
- **Grup sohbetleri** — kişilerinizden grup oluşturun, üye davet edin ve şifreli mesajlaşın.
- **Alanlar (Spaces)** — kenar çubuğunu düzenlemek için yerel kişi grupları. Ağa gönderilmez.
- **Zengin mesajlar** — yanıt, emoji tepkisi, düzenleme, geri çekme, mesaj arama, bahsetmeler ve yıldızlı sohbetler.
- **Ekler** — **10 MB**'a kadar fotoğraf, belge ve sesli mesaj; büyük dosyalar 16 KB'lık şifreli parçalar hâlinde cihazdan cihaza aktarılır.
- **Meta veri temizliği** — sabit görseller gönderilmeden önce JPEG'e yeniden kodlanır; EXIF ve GPS verisi atılır.
- **Ekstra içerik** — anket, etkinlik, konum, kişi kartı ve GIF.
- **Bağlantı önizlemeleri** — gizlilik kontrollü: sor, engelle veya izin ver.
- **Sohbet yönetimi** — sabitleme, sessize alma, arşivleme, temizleme, silme, duvar kâğıdı, okunmamış sayacı ve 72 saatlik son kullanma.
- **Bildirimler** — sekme arka plandayken isteğe bağlı sistem bildirimi, ses ve önizleme.

### Kimlik ve bağlantı

- **12 haneli Q7 kodu** — anahtar parmak izinden türetilir; parola değil, adrestir.
- **Dört eşleşme yolu** — Q7 kodu, QR kod, davet dosyası ve yapıştırılan davet metni.
- **Bağlantı istekleri** — gelen istekler kabul veya ret edilebilir.
- **Kişi doğrulama** — güvenlik numaraları ile iki taraf parmak izlerini bant dışı karşılaştırabilir.
- **Engelleme ve kısıtlama** — kişiyi engelleyin veya yalnızca kişi listenizdekilerin bağlanmasına izin verin.
- **Cihaz bağlama** — kurulum ekranındaki `Q7DEV:` QR kodunu tarayarak ikinci cihaz bağlayın.

### Gizlilik ve güvenlik kontrolleri

- **Yerel kasa** — isteğe bağlı parola kilidi; PBKDF2-SHA256 (310.000 tur), AES-GCM ve isteğe bağlı TOTP doğrulayıcı kodu. Kimlik anahtarları diskte mühürlenir; parola cihazdan çıkmaz.
- **Hareketsizlik kilidi** — belirlenen süre sonunda kasa otomatik kilitlenir.
- **Şifreli yerel yedek** — *henüz yok*. Mevcut dışa aktarma düz JSON anlık görüntüsüdür; güvenli bir yerde saklayın.
- **Hareketi azalt, metin boyutu, tema, vurgu rengi** — erişilebilirlik ve görünüm ayarları.
- **17 dil** ve Arapça için sağdan sola (RTL) destek.
- **Sıkı İçerik Güvenliği Politikası** — `next.config.mjs` içinde (Next.js bootstrap betikleri için `unsafe-inline` istisnası belgelenmiştir).

## Nasıl çalışır?

```text
┌─────────────────┐                         ┌─────────────────┐
│   Cihaz A       │                         │   Cihaz B       │
│                 │    WebRTC DataChannel   │                 │
│  IndexedDB      │ ◄═════════════════════► │  IndexedDB      │
│  kimlik anahtarı│       (tercih edilen)   │  kimlik anahtarı│
│  mesajlar       │                         │  mesajlar       │
└────────┬────────┘                         └────────┬────────┘
         │                                           │
         │        şifreli çerçeveler (Q7RP v2)        │
         └──────────────► halka açık MQTT ◄───────────┘
                          röleler / posta kutusu
                     hash'lenmiş konular + şifreli metin
```

1. **Kimlik.** Her cihaz bir ECDSA P-256 imza anahtarı ve bir ECDH P-256 statik anahtarı üretir. Açık imza anahtarının SHA-256 parmak izi cihaz kimliği olur; ilk 6 bayt 12 haneli Q7 kodunu verir.
2. **Eşleşme.** Cihaz, alıcının kodundan türetilen konuya mühürlü ve imzalı bir teklif yayınlar. Alıcı yanıtlar; iki taraf statik ECDH anahtarlarından ortak ikili anahtar türetir.
3. **Doğrudan taşıma.** WebRTC DataChannel canlı trafiği ve parçalı dosya aktarımını ileri gizlilik sağlayan geçici ECDH oturumuyla taşır.
4. **Röle yedeği.** Doğrudan kanal yoksa çerçeveler ikili anahtarla mühürlenir, ECDSA ile imzalanır ve halka açık MQTT broker'larına yayınlanır. Saklanan posta kutusu kopyaları alıcının sonradan yetişmesini sağlar.
5. **Onaylar.** Alıcı imzalı teslim makbuzu gönderir; gönderen broker'lardaki saklanan kopyaları temizler.
6. **Son kullanma.** Her mesaj `expiresAt = createdAt + 72s` alır. Süresi dolan kayıtlar ve dosyalar başlangıçta ve zamanlayıcıyla IndexedDB'den silinir.

Tam tel formatı, konu düzeni, tekrar penceresi, posta kutusu akışı ve tehdit modeli [PROTOCOL.md](PROTOCOL.md) içinde; koda yönelik derinlemesine genel bakış [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) içindedir.

## Güvenlik ve gizlilik modeli

**Q7 Chat'in koruduğu durumlar**

- Röle operatörlerinin mesaj içeriğini okuması: çerçeveler AES-256-GCM ile şifrelidir, konular hash'lenir.
- Mesaj değiştirme ve sahte gönderen: çerçeveler ECDSA P-256 ile imzalanır; gönderen kimliği imza anahtarına bağlıdır.
- Tekrar oynatma ve çift teslim: sıra pencereleri ve mesaj kimliği tekilleştirme.
- Sessiz kişi değiştirme: güvenlik numaraları ve elle parmak izi karşılaştırma.
- Parola olmadan yerel anahtar hırsızlığı: isteğe bağlı kasa kimlik anahtarlarını diskte mühürler.

**Korumadığı durumlar**

- Ele geçirilmiş cihaz, kötü niyetli tarayıcı eklentisi veya uygulama kaynağında XSS.
- Röleler tarafından meta veri analizi: zamanlama, yaklaşık boyut ve hash'lenmiş konular görünür kalır.
- Gelecekteki kuantum saldırganı: mevcut primitifler klasiktir (P-256, AES-GCM).
- Kilidi açık cihazınıza veya düz metin JSON yedeğinize erişen biri.
- Hukuki veya zorlama senaryoları. Bu araç muhbirlik düzeyinde değildir.

Tasarım bilinçli olarak basit ve incelenebilir tutulmuştur; ancak **bağımsız güvenlik denetimi almamıştır**. Tam politika ve bildirim talimatları için [SECURITY.md](SECURITY.md) dosyasına bakın.

## Teknoloji yığını

| Katman | Seçim |
| --- | --- |
| Çatı | [Next.js 14](https://nextjs.org/) App Router |
| Dil | [TypeScript 5](https://www.typescriptlang.org/) |
| Arayüz | [React 18](https://react.dev/), [Tailwind CSS 3](https://tailwindcss.com/), [Lucide](https://lucide.dev/) |
| Depolama | IndexedDB (`lib/db.ts`), testlerde `fake-indexeddb` |
| Kriptografi | Web Crypto API — ECDSA P-256, ECDH P-256, HKDF, AES-256-GCM, PBKDF2-SHA256 |
| Taşıma | WebRTC DataChannel, WSS üzerinden MQTT 3.1.1 |
| QR | `qrcode` (üretme) ve `jsqr` (tarama) |
| Test | [Vitest](https://vitest.dev/) |

## Başlangıç

### Gereksinimler

- **Node.js 18.17+** (Node 20 LTS önerilir; bkz. `.nvmrc`)
- **npm 9+**
- WebCrypto, IndexedDB ve WebRTC destekleyen modern bir tarayıcı
- Üretimde WebCrypto ve P2P için **HTTPS veya localhost**

### Kurulum ve çalıştırma

```bash
git clone https://github.com/<sizin-org>/q7-message.git
cd q7-message
npm ci
npm run dev
```

<http://localhost:3000> adresini açın. P2P `localhost` üzerinde çalışır; telefon veya başka bir makinede HTTPS (dağıtım ya da HTTPS tüneli) kullanın.

### İlk çalıştırma

1. Kurulum sihirbazı cihaz kimliğinizi oluşturur ve görünen adınızı sorar.
2. **Bağlan** sekmesinde 12 haneli Q7 kodunuzu görün.
3. Kod, QR kod veya davet dosyası ile diğer cihazla eşleşin.
4. Bağlantı isteğini kabul edin ve sohbete başlayın.

### İki cihazla test

- Uygulamayı HTTPS'li bir ortama dağıtın veya geliştirme sunucunuzu HTTPS tüneliyle açın.
- Aynı adresi iki cihazda açın.
- Kod veya QR ile eşleşin.
- Doğrudan WebRTC başarısız olursa uygulama otomatik olarak röle moduna düşer.

## Komutlar

| Komut | Açıklama |
| --- | --- |
| `npm run dev` | 3000 portunda Next.js geliştirme sunucusunu başlatır. |
| `npm run build` | Optimize edilmiş üretim derlemesi oluşturur. |
| `npm start` | Üretim derlemesini sunar. |
| `npm run typecheck` | `tsc --noEmit` çalıştırır. |
| `npm test` | Vitest paketini bir kez çalıştırır. |
| `npm run lint` | Next.js lint çalıştırır (ESLint kurulumu gerekir). |

## Dağıtım

Q7 Chat istemci tarafında çalışır; ancak `next.config.mjs` güvenlik başlıkları ve CSP tanımlar. Vercel gibi Next.js çalıştıran bir platforma veya Node.js sunucusuna dağıtın. Statik dosya olarak dışa aktarırsanız eşdeğer başlıkları CDN/sunucunuzda yapılandırın.

Üretim kontrol listesi:

- HTTPS üzerinden sunun.
- `next.config.mjs` içindeki CSP'yi koruyun; bağımlılık ekledikçe gözden geçirin.
- `Permissions-Policy` değerini gözden geçirin; kamera/mikrofon QR tarama ve sesli mesaj için, konum ise konum paylaşımı için yalnızca uygulama kaynağına (`self`) açılmalıdır.
- Öngörülebilir saklama süresi gerekiyorsa kendi MQTT broker'ınızı ekleyin ve varsayılan halka açık röleleri gözden geçirin.
- Depo için GitHub özel güvenlik açığı bildirimini etkinleştirin.

## Proje yapısı

```text
.
├── app/                      # Next.js App Router sayfaları ve genel stiller
│   ├── help/page.tsx         # Uygulama içi yardım
│   ├── learn/page.tsx        # Adım adım eğitim
│   ├── layout.tsx            # Kök düzen, meta veriler ve yazı tipi
│   ├── page.tsx              # Giriş: i18n, store, kilit, P2P sağlayıcıları
│   └── globals.css           # Tailwind katmanları ve tasarım değişkenleri
├── components/               # React arayüzü
│   ├── Shell.tsx             # Gezinti çubuğu, mobil menü, görünüm yönlendirme
│   ├── ChatList.tsx          # Sohbet listesi ve filtreler
│   ├── Thread.tsx            # Mesaj akışı, süre, durum
│   ├── Composer.tsx          # Metin, ek, ses, emoji
│   ├── Connect.tsx           # Kod/QR/dosya eşleşmesi
│   ├── Contacts.tsx          # Kişi listesi ve güvenlik numaraları
│   ├── Devices.tsx           # Bağlı cihaz yönetimi
│   ├── Settings.tsx          # Profil, gizlilik, röleler, depolama
│   ├── Lock.tsx              # Kasa kilidi ve hareketsizlik kilidi
│   └── ...                   # Diyaloglar, rozetler, kartlar, emoji, GIF, tarayıcı
├── lib/
│   ├── p2p/                  # Protokol uygulaması
│   │   ├── crypto.ts         # Kimlik, zarflar, oturumlar, güvenlik numaraları
│   │   ├── q7rp.ts           # İkili anahtar, imzalı röle çerçeveleri, tekrar penceresi
│   │   ├── mqtt.ts           # WSS üzerinden MQTT 3.1.1
│   │   ├── rtc.ts            # WebRTC DataChannel, STUN/TURN
│   │   ├── manager.ts        # Protokol durum makinesi
│   │   └── context.tsx       # Yönetici için React sağlayıcısı
│   ├── db.ts                 # IndexedDB kalıcılığı ve temizleme
│   ├── store.tsx             # Sohbet/ayar React store'u
│   ├── vault.ts              # Parola + TOTP kasası
│   ├── attach.ts             # Ek doğrulama ve görsel yeniden kodlama
│   ├── i18n.tsx              # Dil algılama ve sözlükler
│   ├── types.ts              # Ortak alan tipleri
│   └── ...                   # Tema, bağlantılar, isimler, zaman, yardımcılar
├── langs/                    # 17 JSON çeviri dosyası
├── public/                   # Logolar ve statik varlıklar
├── tests/                    # Vitest paketleri
├── docs/                     # Mimari, dağıtım, yol haritası, çeviriler
├── .github/                  # CI, issue/PR şablonları, Dependabot
├── Dockerfile                # Çok aşamalı üretim imajı
├── .nvmrc                    # Yerel geliştirme için Node 20
├── PROTOCOL.md               # Q7RP tel protokolü
├── SECURITY.md               # Güvenlik politikası ve tehdit modeli
├── CONTRIBUTING.md           # Katkı rehberi
├── CODE_OF_CONDUCT.md        # Topluluk kuralları
├── PRIVACY.md                # Veri ve ağ gizliliği notları
├── CHANGELOG.md              # Sürüm geçmişi
├── LICENSE                   # Mozilla Public License 2.0
└── NOTICE                    # Telif ve üçüncü taraf bildirimleri
```

## Çok dillilik

Arayüz 17 dille gelir: İngilizce, Türkçe, Almanca, Çince, Japonca, Korece, Fransızca, İspanyolca, Portekizce, Rusça, Lehçe, Ukraynaca, Hintçe, Endonezce, İtalyanca, Felemenkçe ve Arapça. Tarayıcı dili otomatik algılanır, İngilizce yedektir ve Arapça belgeyi RTL'e çevirir.

Dil eklemek veya güncellemek için:

1. `langs/en.json` dosyasını `langs/<kod>.json` olarak kopyalayın.
2. Değerleri çevirin; her `{placeholder}` ifadesini değiştirmeden bırakın.
3. Dili `lib/i18n.tsx` içinde (`LANGS` ve `loaders`) kaydedin.
4. `npm test` çalıştırın — i18n paketi her dosyayı, anahtarı, değeri ve yer tutucuyu kontrol eder.

Ayrıntılar için [docs/TRANSLATIONS.md](docs/TRANSLATIONS.md).

## Testler

```bash
npm run typecheck
npm test
```

Paket şunları kapsar:

- IndexedDB depolama ve temizleme (`tests/db.test.ts`)
- Çeviri bütünlüğü ve dil algılama (`tests/i18n.test.ts`)
- Kripto zarfları, kimlik ve oturumlar (`tests/p2p.test.ts`)
- Uçtan uca protokol simülasyonu (`tests/protocol-sim.test.ts`)
- Q7RP çerçeveleri, imzalar, tekrar pencereleri ve konular (`tests/q7rp.test.ts`)
- Kasa mühürleme, parola değiştirme ve TOTP (`tests/vault.test.ts`)

CI her push ve pull request'te tip kontrolü, testler ve üretim derlemesi çalıştırır. Bkz. [.github/workflows/ci.yml](.github/workflows/ci.yml).

## Sınırlar ve yol haritası

Tam liste için [docs/ROADMAP.md](docs/ROADMAP.md). Bilinen eksikler:

- Sesli/görüntülü arama yok (Calls girişi yer tutucudur).
- Çok cihazlı mesaj senkronizasyonu yok; cihaz bağlama var ama geçmiş cihaz başına.
- Şifreli yedek formatı yok; dışa aktarmalar düz JSON.
- PWA kurulum kabuğu veya çevrimdışı uygulama önbelleği yok.
- Bağımsız güvenlik denetimi yok.
- Halka açık rölelerin çalışma süresi veya saklama garantisi yok; ciddi kullanım için kendi broker'ınızı barındırın.
- 160 KB üzeri dosyalar yalnızca röle modunda doğrudan bağlantı bekler.

## Katkı

Katkılar memnuniyetle karşılanır. Lütfen önce [CONTRIBUTING.md](CONTRIBUTING.md) ve [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) dosyalarını okuyun.

İyi başlangıç katkıları:

- Çeviriler ve RTL iyileştirmeleri.
- Erişilebilirlik düzeltmeleri (klavye gezinmesi, odak tuzağı, ekran okuyucu etiketleri).
- Protokol uç durumları için testler.
- Dokümantasyon iyileştirmeleri.
- Kendi sunucunuzda röle kurma tarifleri.

Katkıda bulunarak, katkılarınızın Mozilla Public License 2.0 altında lisanslanmasını kabul edersiniz.

## Güvenlik bildirimleri

**Güvenlik açıkları için herkese açık issue açmayın.** GitHub özel güvenlik açığı bildirimini (Security → Advisories → Report a vulnerability) kullanın veya bakımcılarla özel olarak iletişime geçin. Kapsam ve yanıt beklentileri için [SECURITY.md](SECURITY.md).

## Gizlilik

Q7 Chat kimliğinizi, sohbetlerinizi ve eklerinizi cihazınızda saklar. Analitik veya izleyici içermez. Yine de ağ meta verisi vardır: röleler hash'lenmiş konuları, şifreli metni, zamanlamayı ve IP adreslerini görür; STUN sunucuları IP'nizi görür; GIF arama GIPHY ile iletişim kurar. Ayrıntılar için [PRIVACY.md](PRIVACY.md).

## Lisans

Bu proje **Mozilla Public License 2.0 (MPL-2.0)** ile lisanslanmıştır. Tam metin [LICENSE](LICENSE) dosyasındadır. MPL 2.0, Mozilla Public License'ın güncel sürümüdür; MPL 3.0 diye bir sürüm yoktur.

Kısaca:

- Kodu ticari olarak da kullanabilir, değiştirebilir ve dağıtabilirsiniz.
- MPL kapsamındaki dosyaları değiştirirseniz, dağıtım sırasında bu değiştirilmiş dosyaları MPL altında erişilebilir kılmalısınız.
- Daha büyük eserler, MPL kapsamındaki kodu başka koşullardaki kodla birleştirebilir.
- Marka hakları verilmez.

Telif © 2026 Q7 Chat katkıcıları.

## Teşekkür

- Protokol fikirleri Tox, Keet ve daha geniş P2P mesajlaşma topluluğundan esinlenmiştir.
- MPL 2.0 metni için [Mozilla](https://www.mozilla.org/MPL/2.0/).
- `next/font` üzerinden [Roboto Flex](https://fonts.google.com/specimen/Roboto+Flex) (SIL Open Font License 1.1).
- [NOTICE](NOTICE) ve `package-lock.json` içinde listelenen tüm açık kaynak bağımlılıklar.

---

<p align="center">Sonsuza kadar sürmesi gerekmeyen sohbetler için.</p>
