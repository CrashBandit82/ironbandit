package at.ironbandit.app;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.text.Html;
import android.util.Base64;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.view.WindowInsets;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

import java.io.OutputStream;

/**
 * Thin WebView shell around the IronBandit web app (https://ironbandit.at).
 * All features come from the website; the app only adds file upload,
 * camera access, the screen wake lock,
 * file export, external links and the back button.
 */
public class MainActivity extends Activity {

    private static final String HOST = "ironbandit.at";
    private static final String START_URL = "https://" + HOST + "/";

    private static final int REQ_FILE_CHOOSER = 1;
    private static final int REQ_SAVE_FILE = 2;
    private static final int REQ_CAMERA = 3;

    // Blob downloads (CSV export) cannot leave the WebView as a URL, so the page
    // hands the file content to the app, which saves it via the system dialog.
    private static final String DOWNLOAD_HOOK =
            "(function(){if(window.__appDownloadHook)return;window.__appDownloadHook=true;" +
            "var click=HTMLAnchorElement.prototype.click;" +
            "HTMLAnchorElement.prototype.click=function(){" +
            "if(this.hasAttribute('download')&&this.href.indexOf('blob:')===0){" +
            "var name=this.getAttribute('download')||'download';" +
            "fetch(this.href).then(function(r){return r.blob();}).then(function(b){" +
            "var fr=new FileReader();fr.onload=function(){AppBridge.saveFile(fr.result,name,b.type||'');};" +
            "fr.readAsDataURL(b);});return;}" +
            "return click.apply(this,arguments);};})();";

    // WebView has no Screen Wake Lock API; map it to FLAG_KEEP_SCREEN_ON.
    private static final String WAKE_LOCK_SHIM =
            "(function(){if('wakeLock' in navigator)return;var n=0;" +
            "navigator.wakeLock={request:function(){n++;AppBridge.keepScreenOn(true);" +
            "var s=new EventTarget();s.type='screen';s.released=false;" +
            "s.release=function(){if(!s.released){s.released=true;" +
            "if(--n<=0){n=0;AppBridge.keepScreenOn(false);}s.dispatchEvent(new Event('release'));}" +
            "return Promise.resolve();};return Promise.resolve(s);}};})();";

    private WebView webView;
    private ValueCallback<Uri[]> filePathCallback;
    private byte[] pendingFile;
    private PermissionRequest pendingPermission;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(getColor(R.color.background));
        webView = new WebView(this);
        root.addView(webView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            // Edge-to-edge (forced from Android 15): keep content clear of bars and keyboard.
            getWindow().setDecorFitsSystemWindows(false);
            root.setOnApplyWindowInsetsListener((v, insets) -> {
                Insets i = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.ime());
                v.setPadding(i.left, i.top, i.right, i.bottom);
                return WindowInsets.CONSUMED;
            });
        }

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setUserAgentString(s.getUserAgentString() + " IronBandit-Android/" + BuildConfig.VERSION_NAME);

        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, false);

        webView.addJavascriptInterface(new Bridge(), "AppBridge");
        webView.setWebViewClient(new ShellClient());
        webView.setWebChromeClient(new ShellChromeClient());
        webView.setDownloadListener((url, userAgent, contentDisposition, mimeType, length) -> {
            if (url.startsWith("http")) openExternal(Uri.parse(url));
        });

        if (savedInstanceState == null || webView.restoreState(savedInstanceState) == null) {
            webView.loadUrl(START_URL);
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        webView.saveState(outState);
    }

    @Override
    protected void onPause() {
        super.onPause();
        CookieManager.getInstance().flush();
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        webView.destroy();
        super.onDestroy();
    }

    private static boolean isOwnHost(Uri uri) {
        String scheme = uri.getScheme();
        String host = uri.getHost();
        return ("https".equals(scheme) || "http".equals(scheme)) && host != null
                && (host.equalsIgnoreCase(HOST) || host.equalsIgnoreCase("www." + HOST));
    }

    private void openExternal(Uri uri) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (ActivityNotFoundException ignored) {
            // No app for this link (e.g. no mail client installed).
        }
    }

    private class ShellClient extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if (isOwnHost(uri)) return false;
            if (!"intent".equals(uri.getScheme())) openExternal(uri);
            return true;
        }

        @Override
        public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
            getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            view.evaluateJavascript(DOWNLOAD_HOOK, null);
            view.evaluateJavascript(WAKE_LOCK_SHIM, null);
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            if (!request.isForMainFrame()) return;
            String html = "<html><head><meta name='viewport' content='width=device-width,initial-scale=1'>"
                    + "<style>body{font-family:sans-serif;background:#0f172a;color:#e2e8f0;display:flex;"
                    + "flex-direction:column;align-items:center;justify-content:center;height:90vh;"
                    + "text-align:center;padding:0 24px}a{color:#fff;background:#334155;padding:12px 20px;"
                    + "border-radius:10px;text-decoration:none;margin-top:16px}</style></head><body>"
                    + "<h2>" + Html.escapeHtml(getString(R.string.offline_title)) + "</h2>"
                    + "<p>" + Html.escapeHtml(getString(R.string.offline_text)) + "</p>"
                    + "<a href='" + START_URL + "'>" + Html.escapeHtml(getString(R.string.retry)) + "</a>"
                    + "</body></html>";
            view.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null);
        }
    }

    private class ShellChromeClient extends WebChromeClient {
        @Override
        public void onPermissionRequest(PermissionRequest request) {
            boolean camera = false;
            for (String r : request.getResources()) {
                if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(r)) camera = true;
            }
            if (!camera || !isOwnHost(request.getOrigin())) {
                request.deny();
            } else if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
                request.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});
            } else {
                if (pendingPermission != null) pendingPermission.deny();
                pendingPermission = request;
                requestPermissions(new String[]{Manifest.permission.CAMERA}, REQ_CAMERA);
            }
        }

        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                         FileChooserParams params) {
            if (filePathCallback != null) filePathCallback.onReceiveValue(null);
            filePathCallback = callback;

            boolean imagesOnly = params.getAcceptTypes().length > 0;
            for (String accept : params.getAcceptTypes()) {
                for (String type : accept.split(",")) {
                    if (!type.trim().startsWith("image/")) imagesOnly = false;
                }
            }
            Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            // CSV files show up under many MIME types, so only images get filtered.
            intent.setType(imagesOnly ? "image/*" : "*/*");
            intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE,
                    params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE);
            try {
                startActivityForResult(intent, REQ_FILE_CHOOSER);
            } catch (ActivityNotFoundException e) {
                filePathCallback.onReceiveValue(null);
                filePathCallback = null;
            }
            return true;
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        if (requestCode != REQ_CAMERA || pendingPermission == null) return;
        if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) {
            pendingPermission.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});
        } else {
            pendingPermission.deny();
        }
        pendingPermission = null;
    }

    private class Bridge {
        @JavascriptInterface
        public void keepScreenOn(boolean on) {
            runOnUiThread(() -> {
                if (on) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            });
        }

        @JavascriptInterface
        public void saveFile(String dataUrl, String name, String mimeType) {
            int comma = dataUrl.indexOf(',');
            if (comma < 0) return;
            byte[] bytes = Base64.decode(dataUrl.substring(comma + 1), Base64.DEFAULT);
            runOnUiThread(() -> {
                pendingFile = bytes;
                Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType(mimeType.isEmpty() ? "application/octet-stream" : mimeType);
                intent.putExtra(Intent.EXTRA_TITLE, name);
                try {
                    startActivityForResult(intent, REQ_SAVE_FILE);
                } catch (ActivityNotFoundException e) {
                    pendingFile = null;
                    Toast.makeText(MainActivity.this, R.string.save_failed, Toast.LENGTH_SHORT).show();
                }
            });
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == REQ_FILE_CHOOSER) {
            if (filePathCallback == null) return;
            Uri[] result = null;
            if (resultCode == RESULT_OK && data != null) {
                ClipData clip = data.getClipData();
                if (clip != null) {
                    result = new Uri[clip.getItemCount()];
                    for (int i = 0; i < clip.getItemCount(); i++) result[i] = clip.getItemAt(i).getUri();
                } else if (data.getData() != null) {
                    result = new Uri[]{data.getData()};
                }
            }
            filePathCallback.onReceiveValue(result);
            filePathCallback = null;
        } else if (requestCode == REQ_SAVE_FILE) {
            byte[] bytes = pendingFile;
            pendingFile = null;
            if (resultCode != RESULT_OK || data == null || data.getData() == null || bytes == null) return;
            try (OutputStream out = getContentResolver().openOutputStream(data.getData())) {
                out.write(bytes);
                Toast.makeText(this, R.string.saved, Toast.LENGTH_SHORT).show();
            } catch (Exception e) {
                Toast.makeText(this, R.string.save_failed, Toast.LENGTH_SHORT).show();
            }
        } else {
            super.onActivityResult(requestCode, resultCode, data);
        }
    }
}
