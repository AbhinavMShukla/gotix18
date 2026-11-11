GOTIX 18 v2 - Online Lobby / Challenge / Exit fixes

1. Back up your www folder.
2. Copy index.html -> www/index.html
   css/style.css -> www/css/style.css
   js/main.js -> www/js/main.js
   js/firebase.js -> www/js/firebase.js
3. Run npx cap sync android and rebuild APK. Install over existing app.
   Do NOT uninstall or clear app data.

Changes:
- Removed separate Create Room button. Challenge a Friend creates room.
- Invite text includes both link (when hosted) and 6-character room code.
- Closing/cancelling Online lobby returns to Home.
- Exiting an active room marks it finished by Firestore transaction, opponent winner.
- Polling no longer overwrites a finished room with playing.
- On finished room snapshot, opponent receives result screen.

LIMITATIONS / TESTING:
- Browser link requires deployment to public HTTPS hosting.
- Disconnect/network-loss detection is NOT implemented; only deliberate Exit/Close.
- Firestore security rules still need to be hardened against malicious clients.
- Exit-player loss statistics and race-proof one-time match rewards need server-authoritative result processing.
- Not tested on an Android device or across two devices. Test both players.
