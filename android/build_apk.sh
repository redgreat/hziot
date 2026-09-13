#!/usr/bin/env bash
# PetTrack APK 手工打包脚本（无需 Gradle / Android Studio）
# 依赖：JDK 8+（keytool/javac）、Android build-tools 34（aapt2/zipalign/d8/apksigner）、platform android-35（android.jar）
# 用法：bash build_apk.sh   （在 android/ 目录下执行）
set -e

SDK="${ANDROID_SDK:-C:/Users/wangcw/.workbuddy/android-sdk}"
BT="$SDK/android-14"          # build-tools 34.0.0
PLATFORM="$SDK/android-35"    # android.jar (API 35)
JAVA="/c/Program Files/Eclipse Adoptium/jdk-26.0.1.8-hotspot/bin"
PROJ="$(cygpath -m "$(cd "$(dirname "$0")" && pwd)")"
SRC="$PROJ/app/src/main"
OUT="$PROJ/build"
KS="$PROJ/keystore/pettrack-debug.keystore"

VERSION_CODE=1
VERSION_NAME="0.3"
MIN_SDK=21
TARGET_SDK=35

rm -rf "$OUT"; mkdir -p "$OUT/classes" "$OUT/dex"

echo "== 1/6 aapt2 编译资源 =="
"$BT/aapt2.exe" compile --dir "$SRC/res" -o "$OUT/resources.zip"

echo "== 2/6 aapt2 链接生成未签名 APK =="
"$BT/aapt2.exe" link -o "$OUT/unsigned.apk" \
  -I "$PLATFORM/android.jar" \
  --manifest "$SRC/AndroidManifest.xml" \
  -R "$OUT/resources.zip" \
  --min-sdk-version "$MIN_SDK" --target-sdk-version "$TARGET_SDK" \
  --version-code "$VERSION_CODE" --version-name "$VERSION_NAME" \
  --java "$OUT/gen" \
  --auto-add-overlay

echo "== 3/6 javac 编译 Java =="
"$JAVA/javac.exe" -source 11 -target 11 -nowarn \
  -classpath "$PLATFORM/android.jar" \
  -d "$OUT/classes" \
  $(find "$OUT/gen" "$SRC/java" -name "*.java") 2>/dev/null || \
"$JAVA/javac.exe" -source 11 -target 11 -nowarn \
  -classpath "$PLATFORM/android.jar" \
  -d "$OUT/classes" \
  $(find "$OUT/gen" "$SRC/java" -name "*.java")

echo "== 4/6 d8 转 dex =="
"$JAVA/jar.exe" --create --file "$OUT/classes.jar" -C "$OUT/classes" .
"$JAVA/java.exe" -cp "$BT/lib/d8.jar" com.android.tools.r8.D8 \
  --release --lib "$PLATFORM/android.jar" --min-api "$MIN_SDK" \
  --output "$OUT/dex" "$OUT/classes.jar"

echo "== 5/6 合入 classes.dex + zipalign =="
OUTB="${OUT//\//\\}"   # jar 工具需要反斜杠路径（正斜杠建临时文件会失败）
(cd "$OUT/dex" && "$JAVA/jar.exe" --update --file "$OUTB\\unsigned.apk" classes.dex)
"$BT/zipalign.exe" -f 4 "$OUT/unsigned.apk" "$OUT/aligned.apk"

echo "== 6/6 apksigner 签名 =="
"$JAVA/java.exe" -cp "$BT/lib/apksigner.jar" com.android.apksigner.ApkSignerTool sign \
  --ks "$KS" --ks-key-alias pettrack \
  --ks-pass pass:pettrack123 --key-pass pass:pettrack123 \
  --out "$PROJ/PetTrack-v$VERSION_NAME.apk" "$OUT/aligned.apk"

"$JAVA/java.exe" -cp "$BT/lib/apksigner.jar" com.android.apksigner.ApkSignerTool verify --print-certs "$PROJ/PetTrack-v$VERSION_NAME.apk"
echo "DONE: $PROJ/PetTrack-v$VERSION_NAME.apk"
