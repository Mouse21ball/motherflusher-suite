# Native push notification release setup

Push registration is implemented in the client, but delivery requires real
Firebase and Apple credentials. Do not add placeholder or fabricated service
configuration files to the repository.

## iOS

1. Create/register the app in the production Firebase project using bundle ID
   `com.dgmentertainment.poker`, then put that project's authentic
   `GoogleService-Info.plist` in `ios/App/App/` (same directory as
   `AppDelegate.swift`) and include it in the Xcode app target's Copy Bundle
   Resources.
2. In Apple Developer, enable the Push Notifications capability for the app
   identifier and create an APNs authentication key. Upload the key to the
   matching Firebase project's Cloud Messaging settings.
3. Enable Push Notifications for the app target in Xcode and use a provisioning
   profile that contains the push entitlement. Confirm the app's signing
   environment supports APNs before distributing.
4. Build/sync the Capacitor app after adding the authentic Firebase file. The
   client uses `@capacitor-firebase/messaging` on both Android and iOS for
   permission state, token retrieval, and token-refresh events. It posts only
   Firebase Messaging (FCM) registration tokens to the backend.

The Firebase Messaging plugin's documented integration requires forwarding
APNs registration success/failure in the app delegate. Do not install another
Capacitor push-notifications plugin alongside Firebase Messaging; the plugin
maintainer documents the two native push plugins as incompatible. The
provisioning profile and Firebase/APNs credentials must be supplied by the app
owner; they cannot be generated from this repository.

## Android

Register the Android app in the matching Firebase project with application ID
`com.dgmentertainment.poker`, then place its authentic `google-services.json`
at `android/app/google-services.json`. The existing Gradle setup applies the
Google Services plugin when this file is present. Android registration also
uses the Firebase Messaging plugin's FCM token.

## Service/backend

In Firebase Console, create a Firebase project, register both app IDs above in
that project, and enable the Firebase Cloud Messaging API (HTTP v1). In Project
settings → Service accounts, generate a Firebase Admin SDK service-account
JSON key. Store the **entire JSON document** as the Replit secret
`FIREBASE_SERVICE_ACCOUNT_JSON` for the server environment that will send
notifications. Do not use the existing Google Play service account or Apple
App Store Server API key for this purpose. Keep that JSON out of Git and the
mobile apps. Without this secret, the scheduler logs once that push delivery is
disabled and does not claim or attempt notifications.

The server's authenticated device/preference API requires registration to accept
`installationId` and `enabled`; `enabled: false` revokes all device tokens for
that installation across prior account ownership. Logout must accept
`POST /api/auth/logout` with `installationId`, revoke that installation, and
invalidate the authenticated session only on a successful response. Device
DELETE requests include both `token` and `installationId`.

The client creates one opaque random UUID with `crypto.randomUUID()` and keeps
it in app local storage. It is stable across FCM token rotation and account
changes, and is sent only to the authenticated device registration/revocation
and logout endpoints. It is not derived from an Apple/Google device identifier,
is not used for advertising or cross-app tracking, and is never logged. It
remains on the installation until app data/storage is cleared or the app is
reinstalled. The server must treat it only as an installation-scoped revocation
key and enforce identity from the authenticated session.

The client never logs device tokens. Test token refresh, account transfer,
all-preferences-off revocation, and failed logout behavior with real
development credentials before release.