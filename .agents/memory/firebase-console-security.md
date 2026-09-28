---
name: Firebase console security status
description: User-confirmed Firebase console settings not discoverable from the repository.
---

As of 2026-09-28, the user confirmed that both mobile Firebase API keys are restricted in Google Cloud Console: Android to the app package and signing key, iOS to the app bundle ID. They also checked Firebase Console and confirmed Firestore, Realtime Database, and Storage were never enabled for this project. They consider the GitHub secret-scanning flag on the mobile Firebase config files fully resolved without key rotation.

**Why:** These external-console settings cannot be determined from the checked-in Firebase configuration files alone; earlier code review established only that the app uses Firebase Messaging for push.

**How to apply:** Do not assume the mobile keys still need rotation or recommend database rules for disabled services solely because their public Firebase config files are checked in. Recheck console state if the app enables another Firebase service or the user reports new findings.