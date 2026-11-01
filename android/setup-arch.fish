#!/usr/bin/env fish

echo "🚀 Arch Linux için Android SDK ve Java Kurulumu Başlatılıyor..."

# 1. Java 17 ve temel paketleri kur
sudo pacman -S --needed jdk17-openjdk curl unzip android-tools

# Java 17'yi aktif yap
sudo archlinux-java set java-17-openjdk

# 2. Android SDK Dizinini Oluştur
set -l SDK_DIR "$HOME/Android/Sdk"
mkdir -p "$SDK_DIR/cmdline-tools"

# 3. Google Resmi Android Command-Line Araçlarını İndir
if not test -d "$SDK_DIR/cmdline-tools/latest"
    echo "📦 Android Command-line araçları indiriliyor..."
    curl -# -L "https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip" -o /tmp/cmdline-tools.zip
    unzip -q /tmp/cmdline-tools.zip -d "$SDK_DIR/cmdline-tools"
    mv "$SDK_DIR/cmdline-tools/cmdline-tools" "$SDK_DIR/cmdline-tools/latest"
    rm /tmp/cmdline-tools.zip
end

# 4. Fish Ortam Değişkenlerini Kaydet
set -Ux ANDROID_HOME "$SDK_DIR"
fish_add_path "$SDK_DIR/cmdline-tools/latest/bin"
fish_add_path "$SDK_DIR/platform-tools"

# 5. Lisansları onayla ve Platform 34 + Build Tools kur
echo "📱 Android SDK 34 ve Build Araçları Yükleniyor..."
yes | sdkmanager --licenses > /dev/null
sdkmanager "platform-tools" "platforms;android-34" "build-tools;34.0.0"

echo "✅ Kurulum tamamlandı! Artık './build-apk.fish' çalıştırarak APK üretebilirsiniz."
