# Android 端（PetTrack WebView 壳，打包 APK）

WebView 壳方案：直接加载**已部署在合宙的 WEB 应用**，OAuth 登录、全部业务功能与浏览器完全一致，无需重复对接。登录态存 WebView 的 DOM storage（localStorage），与浏览器隔离、互不干扰。

## 文件结构

```
android/
├─ settings.gradle / build.gradle / gradle.properties   # Gradle 工程配置
└─ app/
   ├─ build.gradle                                      # applicationId com.hziot.pettrack
   └─ src/main/
      ├─ AndroidManifest.xml                            # INTERNET 权限、启动 Activity
      ├─ java/com/hziot/pettrack/MainActivity.java      # WebView 壳（改 START_URL 即用）
      └─ res/                                           # 布局/主题/图标
```

## 打包 APK 步骤

1. 安装 **Android Studio**（Hedgehog 或更新，自带 SDK）；
2. `File → Open` 打开本 `android/` 目录，等待 Gradle Sync 完成（首次会自动下载依赖）；
3. 打开 `MainActivity.java`，把 `START_URL` 改成你的合宙应用地址：
   ```java
   private static final String START_URL = "https://iot.luatos.com/ai_app/luatos/<你的appId>/login.html";
   ```
4. 菜单 `Build → Build App Bundle(s) / APK(s) → Build APK(s)`；
5. 产物在 `android/app/build/outputs/apk/debug/app-debug.apk`，直接安装即可。
> 正式发布：`Build → Generate Signed App Bundle / APK`，创建/选择签名 keystore 出 release 包。

## 说明

- 域名白名单无要求：请求全部发往 `api-iot.luatos.com`，WebView 无小程序那样的合法域名限制；
- `usesCleartextTraffic="false"`：仅允许 HTTPS；
- 返回键交给 WebView 历史（OAuth 跳转可正常返回）；
- UA 追加 `PetTrackAndroid/0.3` 便于服务端识别（可选）。
