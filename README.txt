GOTIX 18 — GitHub Challenge Links + App Icons

1. BACK UP your working www and Android project.
2. Copy index.html, css/, js/, icons/ to the corresponding www paths.
3. For Android launcher icons, copy the CONTENTS of android-icon-res/
   into android/app/src/main/res/ (merge mipmap-* folders).
   If Android Studio has an existing launcher icon, check AndroidManifest.xml
   references @mipmap/ic_launcher and @mipmap/ic_launcher_round.
4. Run npx cap sync android and build the APK. Do NOT uninstall or clear data.
5. Deploy www/index.html, www/js/, www/css/, www/icons/ to GitHub Pages
   so ?challenge=ABC123 can prefill the room code and open Join UI.

Challenge links use:
https://abhinavmshukla.github.io/gotix18/?challenge=ABC123
The message includes both link and room code.

IMPORTANT: GitHub Pages does not provide verified Android App Links for this
github.io URL. The HTTPS link opens the browser; automatic installed-app
redirect requires a custom verified domain or a separate intent-link flow.

This is not device tested. Room join requires Firestore auth/rules and working
multiplayer backend. Network disconnect auto-forfeit is NOT implemented.
