package com.hziot.pettrack;

import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * 顶级类形式的 WebViewClient（避免匿名内部类）。
 * 全部跳转留在壳内（含 OAuth 授权与回跳）。
 */
public class ShellWebViewClient extends WebViewClient {
    @Override
    public boolean shouldOverrideUrlLoading(WebView view, String url) {
        view.loadUrl(url);
        return true;
    }
}
