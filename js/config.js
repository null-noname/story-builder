// Firebase Configuration and Initialization
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, setPersistence, browserLocalPersistence, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDaXyH96jd-k3r1MRaDiN9KWo2oN2lpaW4",
  authDomain: "editor-app-29ca6.firebaseapp.com",
  projectId: "editor-app-29ca6",
  storageBucket: "editor-app-29ca6.firebasestorage.app",
  messagingSenderId: "666399306180",
  appId: "1:666399306180:web:619b5765655311d4a03491"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

// Set persistence to LOCAL as requested
setPersistence(auth, browserLocalPersistence);

export { auth, db, googleProvider };
