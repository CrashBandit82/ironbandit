import com.android.build.gradle.internal.api.ApkVariantOutputImpl
import java.util.Properties

plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

// Release signing: android/key.properties (local) or env vars (CI), never in git.
val keyProps = Properties().apply {
    val f = rootProject.file("key.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}
fun signingValue(name: String, env: String): String? = keyProps.getProperty(name) ?: System.getenv(env)

android {
    namespace = "at.ironbandit.app"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        // same ID as the former WebView shell, so the native app replaces it
        applicationId = "at.ironbandit.app"
        // notification channels (rest timer) need Android 8
        minSdk = maxOf(flutter.minSdkVersion, 26)
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    signingConfigs {
        val store = signingValue("storeFile", "IRONBANDIT_KEYSTORE")
        if (store != null) {
            create("release") {
                storeFile = file(store)
                storePassword = signingValue("storePassword", "IRONBANDIT_KEYSTORE_PASSWORD")
                keyAlias = signingValue("keyAlias", "IRONBANDIT_KEY_ALIAS")
                keyPassword = signingValue("keyPassword", "IRONBANDIT_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        debug {
            // installs next to the release app, so testing never touches real data
            applicationIdSuffix = ".debug"
        }
        release {
            // unsigned when no keystore is configured (e.g. F-Droid signs itself).
            // Keep this a single token: F-Droid strips the line and the block above.
            signingConfig = signingConfigs.findByName("release")
        }
    }

    dependenciesInfo {
        // F-Droid: no Google-encrypted dependency metadata blob in the APK
        includeInApk = false
        includeInBundle = false
    }
}

// Version code per ABI for --split-per-abi (F-Droid scheme): versionCode * 10 + ABI,
// so a newer version always has the higher code. Up to 2.0.3 Flutter's default
// (ABI * 1000 + versionCode) was used, hence the jump to build number 500.
val abiCodes = mapOf("armeabi-v7a" to 1, "arm64-v8a" to 2, "x86_64" to 3)
android.applicationVariants.configureEach {
    val variant = this
    variant.outputs.forEach { output ->
        val abiVersionCode = abiCodes[output.filters.find { it.filterType == "ABI" }?.identifier]
        if (abiVersionCode != null) {
            (output as ApkVariantOutputImpl).versionCodeOverride = variant.versionCode * 10 + abiVersionCode
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}
