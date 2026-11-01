# Q7 Chat — Android (Kotlin + React Bridge)

Bu klasör, **Electron kullanmadan** React (Next.js) uygulamasını saf **Kotlin** ile yerel Android bileşenlerine bağlayan ve doğrudan **APK** üretebilen tam yerel Android projesidir.

---

## 🏗️ Mimari & Çalışma Mantığı

1. **Native WebView:** Android Jetpack & Modern WebKit bileşeni ile donanım hızlandırmalı olarak Next.js arayüzünü render eder.
2. **Kotlin ↔ React Köprüsü (`AndroidBridge`):**
   - Kotlin tarafında `WebAppInterface.kt` içindeki `@JavascriptInterface` metotları, JavaScript penceresine `window.AndroidBridge` olarak enjekte edilir.
   - React tarafında `lib/android-bridge.ts` üzerinden `isAndroidApp()`, `showAndroidToast()`, `vibrateAndroid()`, `notifyAndroid()`, `shareAndroidText()` gibi yerel fonksiyonlar çağrılır.
3. **WebRTC, Kamera ve Mikrofon Desteği:**
   - `Q7WebChromeClient.kt`, QR kod okuma, WebRTC P2P ses/veri aktarımı ve dosya ekleri için Android izinlerini (`PermissionRequest` ve `onShowFileChooser`) otomatik karşılar.
4. **Fiziksel Geri Tuşu (Back Button):**
   - Android donanım geri tuşuna basıldığında önce React içine `android-back-press` CustomEvent gönderilir, eğer React tarafından işlenmezse WebView geri gider.

---

## 📱 APK Oluşturma Adımları

### Seçenek 1: Android Studio ile (En Kolay)
1. **Android Studio**'yu açın.
2. **Open** diyerek bu projedeki `android/` klasörünü seçin.
3. Gradle senkronizasyonunun tamamlanmasını bekleyin.
4. Üst menüden **Build** > **Build Bundle(s) / APK(s)** > **Build APK(s)** seçeneğine tıklayın.
5. İşlem bittiğinde sağ altta çıkan bildirimdeki **locate** butonuna tıklayarak oluşturulan `app-debug.apk` dosyasını alın.

### Seçenek 2: Terminal / Gradle ile
Terminalde `android` dizinine gidin ve derleyin:

```bash
cd android

# Debug APK oluşturma (Hemen test etmek için):
./gradlew assembleDebug

# Release APK oluşturma:
./gradlew assembleRelease
```

Oluşturulan APK dosyasının yolu:
`android/app/build/outputs/apk/debug/app-debug.apk`

---

## 📲 Telefona Yükleme (ADB veya Doğrudan)

### ADB ile:
```bash
adb install android/app/build/outputs/apk/debug/app-debug.apk
```

### WhatsApp / Telegram / Google Drive veya USB ile:
`app-debug.apk` dosyasını telefonunuza gönderip açarak "Bilinmeyen kaynaklardan yükle" izniyle doğrudan yükleyebilirsiniz.

---

## ⚙️ Uygulama URL'ini Değiştirme
`android/app/src/main/java/com/q7/chat/MainActivity.kt` dosyasındaki `appUrl` değişkenini kendi sunucu veya geliştirme adresinizle değiştirebilirsiniz:

```kotlin
private val appUrl = "https://ais-dev-x622tnisl4urr6ved37jkw-565495130109.europe-west2.run.app"
```
Yerel ağda test etmek için bilgisayarınızın yerel IP adresini (örn: `http://192.168.1.50:3000`) yazabilirsiniz.
