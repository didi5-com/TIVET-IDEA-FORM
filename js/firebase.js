// Firebase bootstrap for the site (CDN modules)
// Note: Ensure your Firebase project rules allow this unauthenticated prototype.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getFirestore, initializeFirestore } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";

// Your Firebase configuration (updated storageBucket for client-side Storage)
const firebaseConfig = {
  apiKey: "AIzaSyBpMgyAsOT5tWWaRlAKLKXJWUg_NUmvBYM",
  authDomain: "tivet-ca8fe.firebaseapp.com",
  projectId: "tivet-ca8fe",
  storageBucket: "tivet-ca8fe.appspot.com",
  messagingSenderId: "32068606853",
  appId: "1:32068606853:web:5e7b4bbf64ec08783602ec",
  measurementId: "G-PZJ4MYYVCY"
};

const app = initializeApp(firebaseConfig);
// Improve compatibility in sandboxed/preview environments or strict networks
initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true,
  useFetchStreams: false
});

const db = getFirestore(app);
const storage = getStorage(app);

export { app, db, storage };