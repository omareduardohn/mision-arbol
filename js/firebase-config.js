// js/firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyBha9zw_XWm7pm_YvTEPlUl6qeVKNQx4cI",
  authDomain: "mision-arbol-app.firebaseapp.com",
  projectId: "mision-arbol-app",
  storageBucket: "mision-arbol-app.firebasestorage.app",
  messagingSenderId: "504081270375",
  appId: "1:504081270375:web:11892311681e42806076c2",
  measurementId: "G-E87LKLDSWC"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);