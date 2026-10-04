package com.bocofi.app;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;

public class MainActivity extends Activity {

    // the website files are copied into assets/www when building
    private static final String BASE = "file:///android_asset/www/";

    private WebView homeView, kioskView, appView, adminView;
    private Button tabHome, tabKiosk, tabApp, tabAdmin;
    private WebView currentView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        fixSystemBars();

        homeView = findViewById(R.id.homeView);
        kioskView = findViewById(R.id.kioskView);
        appView = findViewById(R.id.appView);
        adminView = findViewById(R.id.adminView);

        tabHome = findViewById(R.id.tabHome);
        tabKiosk = findViewById(R.id.tabKiosk);
        tabApp = findViewById(R.id.tabApp);
        tabAdmin = findViewById(R.id.tabAdmin);

        setupWebView(homeView, "index.html");
        setupWebView(kioskView, "kiosk/index.html");
        setupWebView(appView, "app/index.html");
        setupWebView(adminView, "admin/index.html");

        tabHome.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                showTab(homeView);
            }
        });
        tabKiosk.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                showTab(kioskView);
            }
        });
        tabApp.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                showTab(appView);
            }
        });
        tabAdmin.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                showTab(adminView);
            }
        });

        showTab(homeView);
    }

    private void setupWebView(WebView view, String page) {
        WebSettings settings = view.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);   // needed for localStorage
        settings.setAllowFileAccess(true);

        // shows alert() and confirm() boxes
        view.setWebChromeClient(new WebChromeClient());

        view.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest request) {
                return openLink(request.getUrl().toString());
            }
        });

        view.loadUrl(BASE + page);
    }

    // links to another part (ex. "Open Kiosk" on the home page) switch tabs instead
    private boolean openLink(String url) {
        if (url.contains("/kiosk/")) {
            showTab(kioskView);
            return true;
        }
        if (url.contains("/app/")) {
            showTab(appView);
            return true;
        }
        if (url.contains("/admin/")) {
            showTab(adminView);
            return true;
        }
        if (url.endsWith("www/index.html")) {
            showTab(homeView);
            return true;
        }
        if (url.startsWith("http")) {
            // google maps and other websites open in the browser
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
            return true;
        }
        return false;
    }

    private void showTab(WebView view) {
        homeView.setVisibility(View.GONE);
        kioskView.setVisibility(View.GONE);
        appView.setVisibility(View.GONE);
        adminView.setVisibility(View.GONE);
        view.setVisibility(View.VISIBLE);
        currentView = view;

        highlight(tabHome, view == homeView);
        highlight(tabKiosk, view == kioskView);
        highlight(tabApp, view == appView);
        highlight(tabAdmin, view == adminView);

        // tell the page to reload its data, in case another tab changed something
        view.evaluateJavascript("window.dispatchEvent(new Event('storage'));", null);
    }

    private void highlight(Button button, boolean active) {
        if (active) {
            button.setBackgroundColor(Color.parseColor("#3FADED"));
        } else {
            button.setBackgroundColor(Color.TRANSPARENT);
        }
    }

    // keep the page below the status bar and above the navigation bar and keyboard
    private void fixSystemBars() {
        LinearLayout root = findViewById(R.id.root);
        root.setOnApplyWindowInsetsListener(new View.OnApplyWindowInsetsListener() {
            @Override
            public WindowInsets onApplyWindowInsets(View v, WindowInsets insets) {
                int left, top, right, bottom;
                if (Build.VERSION.SDK_INT >= 30) {
                    android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.ime());
                    left = bars.left;
                    top = bars.top;
                    right = bars.right;
                    bottom = bars.bottom;
                } else {
                    left = insets.getSystemWindowInsetLeft();
                    top = insets.getSystemWindowInsetTop();
                    right = insets.getSystemWindowInsetRight();
                    bottom = insets.getSystemWindowInsetBottom();
                }
                v.setPadding(left, top, right, bottom);
                return insets;
            }
        });
    }

    @Override
    public void onBackPressed() {
        if (currentView != homeView) {
            showTab(homeView);
        } else {
            super.onBackPressed();
        }
    }
}
