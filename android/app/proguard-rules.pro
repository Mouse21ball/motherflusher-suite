# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile

# ─── Capacitor / Cordova interop — preserve plugin bridge classes ─────────────
-keep class com.getcapacitor.** { *; }
-keep class com.getcapacitor.plugin.* { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keep @com.getcapacitor.NativePlugin class * { *; }
-keep class * extends com.getcapacitor.Plugin {
    @com.getcapacitor.PluginMethod public *;
}

# ─── WebView interface preservation ──────────────────────────────────────────
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
-keep public class * extends android.webkit.WebView
-keep public class * extends android.webkit.WebViewClient
-keep public class * extends android.webkit.WebChromeClient

# ─── Cordova plugin compatibility ─────────────────────────────────────────────
-keep class org.apache.cordova.** { *; }
-keep class * extends org.apache.cordova.CordovaPlugin

# ─── Reflection-based libraries ───────────────────────────────────────────────
-keepattributes Signature
-keepattributes Annotation
-keepattributes Exceptions
-keepattributes InnerClasses
-keepattributes EnclosingMethod

# ─── GSON / Jackson model classes (if any) ────────────────────────────────────
-keep class com.dgmentertainment.poker.** { *; }
-keepclassmembers class * {
    @com.google.gson.annotations.SerializedName <fields>;
}

# ─── Strip debug logging in release builds ────────────────────────────────────
-assumenosideeffects class android.util.Log {
    public static *** d(...);
    public static *** v(...);
    public static *** i(...);
}

# ─── Suppress R8 warnings for known-safe missing classes ──────────────────────
-dontwarn javax.annotation.**
-dontwarn org.codehaus.mojo.**
-dontwarn java.lang.invoke.**
