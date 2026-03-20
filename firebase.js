import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBJq0F7ACjane9NvFzonugXchzRX5JEJsM",
  authDomain: "ytshorts-chat.firebaseapp.com",
  projectId: "ytshorts-chat",
  storageBucket: "ytshorts-chat.firebasestorage.app",
  messagingSenderId: "620454498071",
  appId: "1:620454498071:web:515a2d682fd1ca022fb152",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
