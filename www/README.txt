GOTIX 18 - Canvas & Google Profile Repair

Back up your current www folder first.
Copy index.html to www/index.html
Copy js/main.js to www/js/main.js
Copy js/firebase.js to www/js/firebase.js
Copy css/style.css to www/css/style.css

Run: npx cap sync android
Then rebuild and install the APK over the existing app (same application ID and signing key).
Do not uninstall or clear app data.

Changes: board responsive sizing, canvas drawing coordinates match touch coordinates,
ResizeObserver for board layout changes, Google button hidden after authentication,
profile card showing Google name/email and stable Firebase-based player ID.
No change to board graph or move rules.

NOTE: This is a source-level repair, not a device-tested build.
Firestore cloud writes are still client-side and require further validation.
