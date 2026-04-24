import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.dgmentertainment.poker',
  appName: 'DGM Poker',
  webDir: 'dist/public',

  // ── Server config ─────────────────────────────────────────────────────────
  // For production app-store builds, leave `server.url` commented out.
  // Assets will be bundled inside the APK/IPA and loaded locally.
  //
  // For development/testing against a live backend with hot reload, uncomment:
  //   url: 'https://your-app.replit.app'
  //
  server: {
    androidScheme: 'https',
    // url: 'https://your-deployed-backend.replit.app',
  },

  android: {
    // Disallow mixed HTTP/HTTPS content in the WebView.
    allowMixedContent: false,
    // Use hardware back button to navigate within the app (not exit).
    captureInput: true,
  },

  ios: {
    // Respect the device safe area so content clears the notch/home indicator.
    contentInset: 'always',
    // Prefer WKWebView scroll behaviour to feel native.
    scrollEnabled: true,
  },

  plugins: {
    // Splash screen — update colours/duration to match brand before submission.
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: '#05050A',
      androidSplashResourceName: 'splash',
      showSpinner: false,
    },
  },
};

export default config;
