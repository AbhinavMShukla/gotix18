import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged, GoogleAuthProvider, linkWithCredential, signInWithCredential } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, updateDoc, onSnapshot, collection, query, where, limit, getDocs, runTransaction, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

window.gutikaFirebaseReady = true;
let authListenerAttached = false;
window.connectGutikaFirebase = async (cfg) => {
  const app = getApps().length ? getApps()[0] : initializeApp(cfg);
  const auth = getAuth(app);
  const db = getFirestore(app);
  await auth.authStateReady();
  if (!auth.currentUser) await signInAnonymously(auth);
  window.gutikaFB = { db, auth, doc, setDoc, getDoc, updateDoc, onSnapshot, collection, query, where, limit, getDocs, runTransaction, serverTimestamp };
  window.gutikaUser = auth.currentUser;
  if (!authListenerAttached) {
    onAuthStateChanged(auth, user => {
      window.gutikaUser = user;
      window.dispatchEvent(new CustomEvent('gutika-auth-changed', { detail: { uid: user?.uid || null, isAnonymous: user?.isAnonymous ?? true } }));
    });
    authListenerAttached = true;
  }
  return true;
};

window.gutikaGoogleLogin = async () => {
  const fb = window.gutikaFB;
  if (!fb?.auth) throw new Error('Firebase not connected');
  const plugin = window.Capacitor?.Plugins?.FirebaseAuthentication;
  if (!plugin) throw new Error('Google Login requires Android app with FirebaseAuthentication plugin.');
  const nativeResult = await plugin.signInWithGoogle();
  const idToken = nativeResult?.credential?.idToken;
  const accessToken = nativeResult?.credential?.accessToken || null;
  if (!idToken) throw new Error('Google ID token missing. Verify Android OAuth configuration.');
  const credential = GoogleAuthProvider.credential(idToken, accessToken);
  const previousUser = fb.auth.currentUser;
  let result, linked = false, existingAccount = false;
  try {
    if (previousUser?.isAnonymous) {
      result = await linkWithCredential(previousUser, credential);
      linked = true;
    } else {
      result = await signInWithCredential(fb.auth, credential);
    }
  } catch (error) {
    if (error.code !== 'auth/credential-already-in-use' && error.code !== 'auth/email-already-in-use') throw error;
    // Existing Google account: do not overwrite its remote profile or stats.
    result = await signInWithCredential(fb.auth, credential);
    existingAccount = true;
  }
  window.gutikaUser = result.user;
  return { user: result.user, linked, existingAccount, previousUid: previousUser?.uid || null };
};
