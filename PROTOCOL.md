# Q7RP — Q7 Rendezvous & Relay Protocol (v2)

Sunucusuz (serverless), uçtan uca şifreli P2P mesajlaşma protokolü. Keet/Tox mantığında:
karşı tarafa hiçbir sunucuya bağlanmadan, dünyanın her yerinden iletişim. Sunucu
oluşturulmaz ve yönetilmez — yalnızca herkesin zaten erişebildiği **halka açık MQTT
broker'ları** aptal bir taşıyıcı (dumb relay) olarak kullanılır; her şey şifrelidir,
broker ne okur ne de değiştirebilir.

Kod tabanı: `lib/p2p/` — `crypto.ts` (kimlik + zarf + oturum), `q7rp.ts` (relay katmanı),
`mqtt.ts` (halka açık broker taşıyıcısı), `manager.ts` (protokol durum makinesi), `rtc.ts`
(WebRTC düz bağlantı katmanı).

---

## 1. Amaç ve garantiler

| Garanti | Nasıl |
|---|---|
| Sunucusuz çalışma | Sinyal + fallback veri taşıyıcısı olarak halka açık MQTT-over-WSS broker mesh'i |
| Her yerden erişim | WebRTC STUN delik delme (direct) ⇒ kurulamazsa Q7RP relay (UDP kapalı veya simetrik NAT'ta bile çalışır: broker'lar 443/8084 üzerinden WSS) |
| Uçtan uca şifre | ECDH P-256 + HKDF + AES-256-GCM; aktarıcı sadece şifreli metin ve konu hash'leri görür |
| Kimlik doğrulama | Tüm zarflar ve frame'ler cihazın kalıcı imza anahtarıyla imzalı (ECDSA P-256) |
| MITM koruması | 12 haneli adres kodu fingerprint'e bağlı yalnız adres; 30 haneli safety number ile görsel doğrulama |
| Offline teslim | Mailbox: broker'da retained kopyalar, karşı taraf dönünce akar |
| Kayıt ömrü | Mesajlar 72 saat yaşar (API katmanı expiresAt'i yeniden hesaplar; ihlal edilemez) |
| Simetrik NAT / UDP engelli | Doğrudan WebRTC başarısız olursa konuşma relay moduna düşer (Tox'un TCP relay'ine denk gelen Q7RP fallback) |
| Sunucusuz statik uygulama | Uygulama kabuksuz statik dosyadır (PWA); herhangi bir statik host'tan servis edilebilir |

## 2. Kimlik ve adresleme

- **Cihaz kimliği = anahtar çifti:**
  - `signKey`: ECDSA P-256 — her şeyi imzalar.
  - `staticKey`: ECDH P-256 — kalıcı pairwise şifreleme anahtarının kaynağı (`ek`).
  Her ikisi IndexedDB'de saklanır (`p2p_identity`); private anahtar cihazdan çıkmaz.
- **Fingerprint (`fp`)** = `sha256(signKey.pub)` (32 byte).
- **Adres kodu** = fingerprint'in ilk 6 byte'ından türeyen 12 hane (`codeFromFp`).
  Kod gizli bir değer değildir; kimliği "adres" olarak gösterir.
- **Safety number** = `sha256("q7-safety-v1" ‖ sorted(fpA, fpB))` → 6×5 hane. İki taraf
  aynı dizgiyi görür; sesli veya yan yana karşılaştırarak doğrulanır.
- **Konu gizliliği:** broker konuları `sha256` ile pseudonymize edilir (`topicFor`,
  `mailRoot`), bu yüzden broker kimlik stringini düz metin olarak görmez.

## 3. Keşif ve eşleşme (v1 sinyal katmanı)

1. **Knock:** A, `q7/v1/k/<hash(code B)>` konusuna AES-GCM ile kapaklanmış, imzalı
   **offer zarfı** yayınlar: `{t:"offer", rid, pub, name, sdp, ts, sig, to}`. Zarfın
   kapak anahtarı = HKDF(12 haneli kod). `sdp` tam ICE candidate listesini içerir ve
   DTLS fingerprint imza kapsamındadır.
2. B decode eder, imza ve tazeliği doğrular, `q7/v1/r/<hash(rid)>` konusuna aynı kapakla
   mühürlü **answer zarfı** bırakır.
3. WebRTC DataChannel açılır; iki taraf ephemeral ECDH ile "hello" değişir (`q7-hello-v1`)
   → ephemeral oturum anahtarı (forward-secret, transport seviyesi).
4. **v2 eki:** offer/answer/hello içine `ek` (statik ECDH açık anahtarı) konur. Böylece
   pairwise anahtar da eşleşme anında kurulmuş olur; sonraki kullanım tamamen offline
   bile mümkündür.

Zarf biçimi metin/QR/dosya olarak da taşınabilir (`Q7:` deflate+base64) — sinyal
broker'ı erişilemese bile eşleşme çalışır.

## 4. Q7RP v2 — veri katmanı

### 4.1 Transport seçimi (`manager.ts`)
- `transmit()`: canlı bir DataChannel varsa doğrudan ona yazar (v1 yolu: ephemeral
  oturum, chunk'lı dosya).
- Yoksa **Q7RP yolu**: her frame, pairwise anahtarla AES-GCM'a sallanır, imzalanır ve
  relay'lerden koyulur.

### 4.2 Frame biçimi (`lib/p2p/q7rp.ts`)

```jsonc
{
  "v": 2,
  "from": "<fp-hex 64>",      // gönderen fingerprint (fp = sha256(pub) — imzayla bağlı)
  "to":   "<fp-hex 64>",      // alıcı; konu da buna göre hash'lenir
  "pub":  "<b64>",            // gönderen imza anahtarı (doğrulama için)
  "ek":   "<b64>",            // gönderen statik ECDH anahtarı (pair key için)
  "seq":  42,                 // ms-offset monotonic sıra; replay penceresi için
  "iv":   "<b64 12>",         // AES-GCM IV
  "ct":   "<b64>",            // AES-GCM şifreli uygulama frame'i
  "sig":  "<b64>"             // ECDSA(P-256): imza bytes = ["q7rp-v2", from, to, pub, ek, seq, iv, ct]
}
```

`ct` payload'ı uygulama frame'leridir (v1 DataChannel ile aynı şema):
`{k:"msg"…}`, `{k:"file", id, d}` (≤160 KB inline), `{k:"vote", id, c}`.
Chunk'lı büyük dosya aktarımı yalnız direct modda; relay modunda inline ≤160 KB.

### 4.3 Konular

| Konu | Anlamı | retain |
|---|---|---|
| `q7rp/v2/l/<fp>` | canlı push (alıcı şu anda dinliyorsa) | hayır |
| `q7rp/v2/m/<fp>/<msgid>[/<part>]` | **Mailbox** (alıcı offline iken saklanan kopya) | evet |
| `q7rp/v2/a/<fp>/<msgid>` | teslim makbuzu (imzalı) | hayır |
| `q7/v1/…` | v1 eşleşme sinyali | hayır |

### 4.4 Mailbox akışı

1. Gönderici frame'i **tüm bağlı broker'lara** retained olarak koyar; her broker kendi kopyasını taşır.
2. Alıcı bağlandığında `q7rp/v2/m/<benimFp>/#` wildcard aboneliği hemen retained flood alır;
   `SeqWindow` tekrarları reddederek farklı broker'ların kopyalarını tekilleştirir.
3. Alıcı mesajı kendi IndexedDB'sine ekler ve `{k:"ack"}`'i kendi imzasıyla gönderene
   `q7rp/v2/a/<senderFp>` konusuna yazar.
4. Gönderici makbuzu doğrular (`sha256(["q7rp-ack-v1", senderFp, msgId])` üzerinde ECDSA)
   ve **retained kopyaları boş yayınla siler** (`clearRetained`) — her broker kendinkini temizler.
5. Alıcı hiç dönerse broker'ın kopyası kalır (alırken temizlenir); broker-retention süresi
   broker'a bağlıdır ve sözleşmesizdir.

### 4.5 Direct/relay geçişi

- DataChannel açıldığında mod `direct`; `{k:"ping"}`/`{k:"pong"}` her 15 s'de bir ve 45 s
  sessizlik watchdog'u bağlantıyı kapatarak yeniden kurulum tetikler.
- Mod `relay` iken direct sonra açılırsa outbox anında doğrudan akışa geçer;
  daha önce relay'e koyulan retained kopyalar temizlenir.
- Outbox'taki her frame üstel backoff ile yeniden yayınlanır: 20 s → üstel → 8 dk
  limit; 24 denemeden sonra çıkılır (retained kopyalar yine de broker'ın sorumluluğunda kalır).
- Kullanıcı denetimi: Settings → **Public relays** aç/kapa (sinyal+relay), özel relay
  listesi (self-host WSS broker ekleme), isteğe bağlı TURN (simetrik NAT'ta direct'i
  kurtarır; relay'e gerek bırakmayabilir).

## 5. Güvenlik modeli

- Broker (halka açık, kendi başına duran bir depolama): sadece konu hash'leri ve tamamen şifreli,
  imzalı payload görür. Metadata sınırlıdır: konu hash'i + yaklaşık boyut + zamanlama.
- Frame replay → SeqWindow + mesaj-id dedupe; body değiştirme → ECDSA imza reddi;
  fake gönderen (from ≠ sha256(pub)) → reddedilir; hedef (to) değiştirme → imza kapsamında reddedilir.
- Ephemeral değil: relay katmanı uzun ömürlü pairwise anahtarla çalışır — bu, offline
  teslim için bilinçli bir tradeoff'tur. Direct modda forward-secret ephemeral oturum
  tercih edilir.
- Knock payload'i `seal(code)` ile mühürlü; 12 haneli kod broker rotasını zorlaştırır ve
  eşleşme spam'ını engeller.

## 6. Sınırlar (test ederken bil)

- Public broker mesh: `broker.emqx.io:8084`, `broker.hivemq.com:8884`, `test.mosquitto.org:8081`
  (QoS 0, retained destekli). Hizmet kalitesi sözleşmesizdir; özel broker eklenebilir.
- Retained TTL broker'a göre değişir (saatler ~ günler). Garantili offline teslim için
  kendi broker'ını Settings'e eklemek önerilir (aynı protokol, kendi hosting'in).
- Büyük dosyalar (>160 KB) relay modunda bekletilir; direct kurulunca chunk'lı gider.
- ICE-TCP (`a=candidate tcp`) tarayıcıda yeterli değil diye SDP'den budanır.
- Sıralama: relay frame'leri seq ile tekilleştirilir; mesaj görünümü createdAt'e göre sıralanır.

## 7. Test matrisi

| # | Senaryo | Beklenen |
|---|---|---|
| 1 | Aynı LAN'da iki tarayıcı, kod ile eşleşme | online · direct |
| 2 | Ayrı ağlar (örn. telefon vs ev WLAN): kod ile eşleşme | online · direct (STUN delik delme) |
| 3 | Simetrik NAT (iki taraf cep şebekesi) | direct başarısız olursa otomatik `relay`; konuşma akışı sürer |
| 4 | UDP bloklu (örn. sıkı AP) | relay mode: tüm konuşma broker üzerinden çalışır |
| 5 | B kapalıyken A mesaj yazar; B 2 dakika sonra döner | B mailbox'ı alır; A'da `delivered` |
| 6 | B kapalıyken ≤160 KB dosya | dönüşte inline frame ile dosya açılabilir |
| 7 | 3 broker'dan biri ölür | kalan ikisi frame taşır; tek broker ile bile teslim |
| 8 | İki tarayıcıda safety number kıyası | iki ekranda aynı 30 hane |
| 9 | Broker'da msg değiştirmeye / sahte üretmeye kalkış | imza reddedilir; sessiz drop |
| 10 | Sayfa yenilendikten sonra (F5) | kimlik/iletişim/konuşma durumu IndexedDB'de korunur |
| 11 | relay="kapalı" (Settings) | hiçbir MQTT bağlantısı kurulmaz; yalnız QR/dosya ile eşleşme |

## 8. Kod haritası

```
lib/p2p/
  crypto.ts       kimlik, zarflar, hello, sinyal mühürleme, safety number
  q7rp.ts         pairwise key, imzalı relay frame, SeqWindow, konu üretimi
  mqtt.ts         MQTT 3.1.1 over WSS (QoS0, retain, wildcard konu eşleme)
  rtc.ts          WebRTC DataChannel (STUN listesi, opsiyonel TURN)
  manager.ts      durum makinesi: eşleşme, link, outbox, mailbox, ack, heartbeat
  context.tsx     React entegrasyonu (useP2P)
tests/
  p2p.test.ts     kimlik/zarf/oturum/codec testleri
  q7rp.test.ts    pairwise simetri, frame imza/mutasyon reddi, SeqWindow, konular
PROTOCOL.md       bu dosya
```
