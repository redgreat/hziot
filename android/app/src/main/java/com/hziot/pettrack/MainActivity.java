package com.hziot.pettrack;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.os.Bundle;
import android.view.KeyEvent;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * PetTrack Android 壳 — WebView 加载已部署的 WEB 应用。
 * OAuth 登录在 WebView 内原生完成（与浏览器同流程），无需额外对接。
 */
public class MainActivity extends Activity {

    /** 已部署的合宙应用首页（MCP 部署的 pettrack_minip） */
    private static final String START_URL = "https://iot.luatos.com/ai_app/luatos/pettrack_minip/login.html";

    private WebView web;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        web = findViewById(R.id.webview);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);          // 登录态存 localStorage，必须开启
        s.setDatabaseEnabled(true);
        s.setSupportZoom(false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setUserAgentString(s.getUserAgentString() + " PetTrackAndroid/0.3");

        // 全部跳转留在壳内（含 OAuth 授权与回跳）
        web.setWebViewClient(new ShellWebViewClient());

        if (savedInstanceState == null) {
            web.loadUrl(START_URL);
        } else {
            web.restoreState(savedInstanceState);
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK && web != null && web.canGoBack()) {
            web.goBack(); // 返回键交给 WebView 历史
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }
}
