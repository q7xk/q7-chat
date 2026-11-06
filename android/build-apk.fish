#!/usr/bin/env fish
if test -d "$HOME/Android/Sdk"
    set -gx ANDROID_HOME "$HOME/Android/Sdk"
    fish_add_path "$ANDROID_HOME/cmdline-tools/latest/bin"
    fish_add_path "$ANDROID_HOME/platform-tools"
end
chmod +x ./gradlew
./gradlew assembleDebug
