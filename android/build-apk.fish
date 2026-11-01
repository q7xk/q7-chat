#!/usr/bin/env fish

# Ortam değişkenlerini garantiye al
if test -d "$HOME/Android/Sdk"
    set -gx ANDROID_HOME "$HOME/Android/Sdk"
    fish_add_path "$ANDROID_HOME/cmdline-tools/latest/bin"
    fish_add_path "$ANDROID_HOME/platform-tools"
end

echo "🔨 Q7 Chat APK derleniyor (assembleDebug)..."
chmod +x ./gradlew
./gradlew assembleDebug

set -l APK_PATH "app/build/outputs/apk/debug/app-debug.apk"
if test -f "$APK_PATH"
    echo ""
    echo "🎉 Tebrikler! APK başarıyla üretildi:"
    echo "👉 (pwd)/$APK_PATH"
    echo ""
    echo "Telefona yüklemek için (USB takılıysa):"
    echo "adb install $APK_PATH"
else
    echo "❌ APK üretimi başarısız oldu. Lütfen yukarıdaki hata mesajını inceleyin."
end
