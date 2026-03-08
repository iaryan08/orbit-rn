import { initializeApp } from "firebase/app";
import { initializeAuth } from "firebase/auth";
// @ts-ignore
import { getReactNativePersistence } from "@firebase/auth/dist/rn/index.js";
import { getFirestore } from "firebase/firestore";
import { getDatabase } from "firebase/database";
import { getStorage } from "firebase/storage";
import ReactNativeAsyncStorage from "@react-native-async-storage/async-storage";

const firebaseConfig = {
    apiKey: "AIzaSyBclAfuZZaVBGn34ng8pCGMoTxvlKsOW64",
    authDomain: "moonbetweenus-a817e.firebaseapp.com",
    databaseURL: "https://moonbetweenus-a817e-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "moonbetweenus-a817e",
    storageBucket: "moonbetweenus-a817e.firebasestorage.app",
    messagingSenderId: "736404107185",
    appId: "1:736404107185:web:cac0d4fe4b8e230e731790"
};

const app = initializeApp(firebaseConfig);

export const auth = initializeAuth(app, {
    persistence: getReactNativePersistence(ReactNativeAsyncStorage)
});

export const db = getFirestore(app);
export const rtdb = getDatabase(app);
export const storage = getStorage(app);
