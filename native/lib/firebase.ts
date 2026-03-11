import { initializeApp } from "firebase/app";
import { initializeAuth } from "firebase/auth";
// @ts-ignore - Metro will correctly resolve this to the react-native export condition in @firebase/auth
import { getReactNativePersistence } from "@firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getDatabase } from "firebase/database";
import { getStorage } from "firebase/storage";
import ReactNativeAsyncStorage from "@react-native-async-storage/async-storage";

export const firebaseConfig = {
    apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || "AIzaSyBclAfuZZaVBGn34ng8pCGMoTxvlKsOW64",
    authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || "moonbetweenus-a817e.firebaseapp.com",
    databaseURL: process.env.EXPO_PUBLIC_FIREBASE_DATABASE_URL || "https://moonbetweenus-a817e-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || "moonbetweenus-a817e",
    storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || "moonbetweenus-a817e.firebasestorage.app",
    messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "736404107185",
    appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || "1:736404107185:web:cac0d4fe4b8e230e731790"
};

export const app = initializeApp(firebaseConfig);
export const projectId = firebaseConfig.projectId;

export const auth = initializeAuth(app, {
    persistence: getReactNativePersistence(ReactNativeAsyncStorage)
});

export const db = getFirestore(app);
export const rtdb = getDatabase(app);
export const storage = getStorage(app);
