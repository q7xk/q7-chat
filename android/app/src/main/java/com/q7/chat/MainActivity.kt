package com.q7.chat

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.View
import android.webkit.CookieManager
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.ProgressBar
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var progressBar: ProgressBar
    private var filePathCallback: ValueCallback<Array<Uri>>? = null
    private var pendingPermissionRequest: PermissionRequest? = null

    private val prefsName = "q7_chat_config"
    private val keyServerUrl = "server_url"
    
    // Default server URL:
    // - For Android Emulator: "http://10.0.2.2:3000"
    // - For Physical Device on WiFi: "http://192.168.1.X:3000" (or custom server domain)
    private val defaultUrl = "http://10.0.2.2:3000"

    private val filePickerLauncher = registerForActivityResult(
        ActivityResultContracts.GetMultipleContents()
    ) { uris ->
        filePathCallback?.onReceiveValue(uris.toTypedArray())
        filePathCallback = null
    }

    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        val cameraGranted = permissions[Manifest.permission.CAMERA] == true
        val recordAudioGranted = permissions[Manifest.permission.RECORD_AUDIO] == true

        pendingPermissionRequest?.let { request ->
            val requestedResources = request.resources
            val grantedList = mutableListOf<String>()

            for (res in requestedResources) {
                if (res == PermissionRequest.RESOURCE_VIDEO_CAPTURE && cameraGranted) {
                    grantedList.add(res)
                }
                if (res == PermissionRequest.RESOURCE_AUDIO_CAPTURE && recordAudioGranted) {
                    grantedList.add(res)
                }
            }

            if (grantedList.isNotEmpty()) {
                request.grant(grantedList.toTypedArray())
            } else {
                request.deny()
            }
            pendingPermissionRequest = null
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Root layout
        val rootLayout = FrameLayout(this).apply {
            setBackgroundColor(ContextCompat.getColor(context, R.color.bg_dark))
        }

        webView = WebView(this).apply {
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            )
            setBackgroundColor(ContextCompat.getColor(context, R.color.bg_dark))
        }

        progressBar = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                8
            )
            max = 100
            visibility = View.VISIBLE
        }

        rootLayout.addView(webView)
        rootLayout.addView(progressBar)
        setContentView(rootLayout)

        setupWebViewSettings()
        setupClients()
        requestAppPermissions()

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                // Dispatch event to React first, or fall back to history back
                webView.evaluateJavascript(
                    """
                    (function() {
                        const event = new CustomEvent('android-back-press', { cancelable: true });
                        const prevented = !window.dispatchEvent(event);
                        return prevented;
                    })()
                    """.trimIndent()
                ) { result ->
                    val handledByJs = result == "true"
                    if (!handledByJs) {
                        if (webView.canGoBack()) {
                            webView.goBack()
                        } else {
                            finish()
                        }
                    }
                }
            }
        })

        loadConfiguredUrl()
    }

    private fun getCurrentUrl(): String {
        val prefs = getSharedPreferences(prefsName, Context.MODE_PRIVATE)
        return prefs.getString(keyServerUrl, defaultUrl) ?: defaultUrl
    }

    private fun saveUrl(url: String) {
        val prefs = getSharedPreferences(prefsName, Context.MODE_PRIVATE)
        prefs.edit().putString(keyServerUrl, url.trim()).apply()
    }

    private fun loadConfiguredUrl() {
        val url = getCurrentUrl()
        webView.loadUrl(url)
    }

    fun showServerSettingsDialog() {
        val current = getCurrentUrl()
        val input = EditText(this).apply {
            setText(current)
            hint = "http://192.168.1.X:3000 veya https://sunucunuz.com"
            setSelection(text.length)
        }

        AlertDialog.Builder(this)
            .setTitle("Sunucu Adresi")
            .setMessage("React uygulamasının çalıştığı sunucu veya yerel IP adresini girin (örn: http://192.168.1.50:3000):")
            .setView(input)
            .setPositiveButton("Bağlan") { _, _ ->
                val newUrl = input.text.toString().trim()
                if (newUrl.isNotEmpty()) {
                    saveUrl(newUrl)
                    webView.loadUrl(newUrl)
                }
            }
            .setNegativeButton("İptal", null)
            .show()
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebViewSettings() {
        val settings: WebSettings = webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.databaseEnabled = true
        settings.mediaPlaybackRequiresUserGesture = false
        settings.allowFileAccess = true
        settings.allowContentAccess = true
        settings.useWideViewPort = true
        settings.loadWithOverviewMode = true
        settings.cacheMode = WebSettings.LOAD_DEFAULT

        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true)

        // Bridge registration: injects `window.AndroidBridge` into React JavaScript runtime
        webView.addJavascriptInterface(WebAppInterface(this), "AndroidBridge")
    }

    private fun setupClients() {
        webView.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                progressBar.visibility = View.GONE
            }

            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                val url = request?.url?.toString() ?: ""
                // Intercept accidental Google Auth redirects and prompt user for proper URL
                if (url.contains("accounts.google.com")) {
                    showGoogleAuthWarning()
                    return true
                }
                return false
            }

            override fun onReceivedError(view: WebView?, request: WebResourceRequest?, error: WebResourceError?) {
                if (request?.isForMainFrame == true) {
                    progressBar.visibility = View.GONE
                    showConnectionErrorDialog(error?.description?.toString() ?: "Bağlantı kurulamadı")
                }
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView?, newProgress: Int) {
                if (newProgress < 100) {
                    progressBar.visibility = View.VISIBLE
                    progressBar.progress = newProgress
                } else {
                    progressBar.visibility = View.GONE
                }
            }

            override fun onPermissionRequest(request: PermissionRequest) {
                pendingPermissionRequest = request
                val needsCamera = request.resources.contains(PermissionRequest.RESOURCE_VIDEO_CAPTURE)
                val needsMic = request.resources.contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE)

                val permissionsToRequest = mutableListOf<String>()
                if (needsCamera && ContextCompat.checkSelfPermission(this@MainActivity, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
                    permissionsToRequest.add(Manifest.permission.CAMERA)
                }
                if (needsMic && ContextCompat.checkSelfPermission(this@MainActivity, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                    permissionsToRequest.add(Manifest.permission.RECORD_AUDIO)
                }

                if (permissionsToRequest.isNotEmpty()) {
                    permissionLauncher.launch(permissionsToRequest.toTypedArray())
                } else {
                    request.grant(request.resources)
                    pendingPermissionRequest = null
                }
            }

            override fun onShowFileChooser(
                wv: WebView?,
                callback: ValueCallback<Array<Uri>>?,
                params: FileChooserParams?
            ): Boolean {
                filePathCallback?.onReceiveValue(null)
                filePathCallback = callback
                filePickerLauncher.launch("*/*")
                return true
            }
        }
    }

    private fun showGoogleAuthWarning() {
        AlertDialog.Builder(this)
            .setTitle("Doğrudan Sunucu Gerekli")
            .setMessage("Google bulut önizleme adresi Google ile oturum açma gerektirir. Lütfen yerel ağ IP'nizi (örn: http://192.168.1.X:3000) veya kendi sunucu adresinizi girin.")
            .setPositiveButton("Adresi Değiştir") { _, _ -> showServerSettingsDialog() }
            .setNegativeButton("Kapat", null)
            .show()
    }

    private fun showConnectionErrorDialog(errorMsg: String) {
        val current = getCurrentUrl()
        AlertDialog.Builder(this)
            .setTitle("Sunucuya Bağlanılamadı")
            .setMessage("Adres: $current\nHata: $errorMsg\n\nBilgisayarınızda Next.js sunucusunun açık olduğundan ve telefon ile aynı WiFi ağında olduğunuzdan emin olun.")
            .setPositiveButton("Adresi Değiştir") { _, _ -> showServerSettingsDialog() }
            .setNegativeButton("Tekrar Dene") { _, _ -> loadConfiguredUrl() }
            .show()
    }

    private fun requestAppPermissions() {
        val permissions = mutableListOf(
            Manifest.permission.CAMERA,
            Manifest.permission.RECORD_AUDIO
        )
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            permissions.add(Manifest.permission.POST_NOTIFICATIONS)
        }

        val needed = permissions.filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }

        if (needed.isNotEmpty()) {
            permissionLauncher.launch(needed.toTypedArray())
        }
    }

    override fun onDestroy() {
        webView.destroy()
        super.onDestroy()
    }
}
