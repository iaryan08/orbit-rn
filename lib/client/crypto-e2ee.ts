"use client";

/**
 * Orbit E2EE Cryptography Layer
 * Force Compiled with explicit Buffer casts to satisfy TypeScript's strict ArrayBuffer checks.
 */

import { orbitFetch } from '@/lib/client/network';
import {
    MEDIA_CRYPTO_IV_LENGTH,
    MEDIA_CRYPTO_KEY_LENGTH,
} from "@/lib/shared/media-crypto-params";
import { decodeMediaToken } from "@/lib/media-tokens";
import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";

const MEDIA_KEY_STORAGE = "orbit:media:key:v1";
const MEDIA_KEY_NATIVE_STORAGE = "orbit_media_key_v1_secure";
const E2EE_ENABLED_STORAGE = "orbit:e2ee:enabled:v1";
const RECOVERY_KIT_VERSION = 1;
export interface EscrowBlob {
    version: number;
    fingerprintHex: string | null;
    saltB64: string;
    ivB64: string;
    ciphertextB64: string;
}

export function isE2EEEnabled() {
    if (typeof window === "undefined") return true;
    try {
        return localStorage.getItem(E2EE_ENABLED_STORAGE) !== "0";
    } catch { return true; }
}

export async function setE2EEEnabled(enabled: boolean) {
    if (typeof window !== "undefined") {
        localStorage.setItem(E2EE_ENABLED_STORAGE, enabled ? "1" : "0");
    }
    return enabled;
}

const isNativePlatform = () => typeof window !== "undefined" && Capacitor.isNativePlatform();

export async function warmMediaKeyCache() {
    if (typeof window === "undefined") return;
    // On native, this triggers the initial hydration from secure storage
    if (isNativePlatform()) {
        await getStoredMediaKeyAsync();
    }
}

/**
 * UTILS: Base64Url encoding/decoding
 */
function toBase64Url(bytes: Uint8Array) {
    let binary = "";
    for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(input: string): Uint8Array {
    const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    const raw = atob(padded);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
    return bytes;
}

/**
 * KEY MANAGEMENT
 */
let cachedHkdfKey: CryptoKey | null = null;
let lastKeyB64 = "";

export function getStoredMediaKey() {
    if (typeof window === "undefined") return "";
    return localStorage.getItem(MEDIA_KEY_STORAGE) || "";
}

export async function getStoredMediaKeyAsync() {
    if (isNativePlatform()) {
        const { value } = await Preferences.get({ key: MEDIA_KEY_NATIVE_STORAGE });
        return value || "";
    }
    return getStoredMediaKey();
}

export function hasStoredMediaPassphrase() {
    const key = getStoredMediaKey();
    return !!(key && key.trim().length > 10);
}

export function setStoredMediaPassphrase(value: string) {
    if (typeof window === "undefined") return;
    localStorage.setItem(MEDIA_KEY_STORAGE, value);
    if (isNativePlatform()) Preferences.set({ key: MEDIA_KEY_NATIVE_STORAGE, value });
    cachedHkdfKey = null;
    lastKeyB64 = "";
}

export function clearStoredMediaPassphrase() {
    if (typeof window === "undefined") return;
    localStorage.removeItem(MEDIA_KEY_STORAGE);
    if (isNativePlatform()) Preferences.remove({ key: MEDIA_KEY_NATIVE_STORAGE });
    cachedHkdfKey = null;
    lastKeyB64 = "";
}

async function importHkdfMasterKey(keyB64: string) {
    if (cachedHkdfKey && lastKeyB64 === keyB64) return cachedHkdfKey;
    const raw = fromBase64Url(keyB64);
    const key = await crypto.subtle.importKey("raw", raw.buffer as ArrayBuffer, { name: "HKDF" }, false, ["deriveKey"]);
    cachedHkdfKey = key;
    lastKeyB64 = keyB64;
    return key;
}

async function deriveFileKey(masterKeyMaterial: string, fileId: string) {
    const hkdfMaster = await importHkdfMasterKey(masterKeyMaterial);
    const encoder = new TextEncoder();
    const info = encoder.encode(fileId);
    return crypto.subtle.deriveKey(
        { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(32) as any, info: info as any },
        hkdfMaster,
        { name: "AES-GCM", length: MEDIA_CRYPTO_KEY_LENGTH * 8 },
        false,
        ["encrypt", "decrypt"]
    );
}

export async function ensureMediaPassphrase(): Promise<string | null> {
    const existing = await getStoredMediaKeyAsync();
    if (existing) return existing;
    const raw = crypto.getRandomValues(new Uint8Array(MEDIA_CRYPTO_KEY_LENGTH));
    const generated = toBase64Url(raw);
    setStoredMediaPassphrase(generated);
    return generated;
}

/**
 * EXPORT: TEXT ENCRYPTION/DECRYPTION
 */
export async function encryptText(text: string, fileId: string) {
    const keyMaterial = await ensureMediaPassphrase();
    if (!keyMaterial) throw new Error("Key missing");
    const key = await deriveFileKey(keyMaterial, fileId);
    const iv = crypto.getRandomValues(new Uint8Array(MEDIA_CRYPTO_IV_LENGTH));
    const plain = new TextEncoder().encode(text);
    const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, plain as BufferSource);
    return { ciphertextB64: toBase64Url(new Uint8Array(cipher)), ivB64: toBase64Url(iv) };
}

export async function decryptText(ciphertextB64: string, fileId: string, ivB64: string): Promise<string> {
    const keyMaterial = await getStoredMediaKeyAsync();
    if (!keyMaterial) return "[Key Missing]";
    try {
        const key = await deriveFileKey(keyMaterial, fileId);
        const decrypted = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv: fromBase64Url(ivB64) as BufferSource },
            key,
            fromBase64Url(ciphertextB64) as BufferSource
        );
        return new TextDecoder().decode(decrypted);
    } catch { return "[Decryption Failed]"; }
}

/**
 * EXPORT: BLOB ENCRYPTION/DECRYPTION
 */
export async function encryptMediaFile(file: File, fileId: string) {
    const keyMaterial = await ensureMediaPassphrase();
    if (!keyMaterial) throw new Error("Key missing");
    const key = await deriveFileKey(keyMaterial, fileId);
    const iv = crypto.getRandomValues(new Uint8Array(MEDIA_CRYPTO_IV_LENGTH));
    const plain = await file.arrayBuffer();
    const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, plain as BufferSource);
    return { blob: new Blob([cipher]), ivB64: toBase64Url(iv), mime: file.type };
}

export async function decryptMediaBlob(blob: Blob, fileId: string, ivB64: string, mime: string) {
    const keyMaterial = await getStoredMediaKeyAsync();
    if (!keyMaterial) throw new Error("Key missing");
    const key = await deriveFileKey(keyMaterial, fileId);
    const cipher = await blob.arrayBuffer();
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64Url(ivB64) as BufferSource }, key, cipher as BufferSource);
    return new Blob([decrypted], { type: mime });
}

/**
 * EXPORT: UTILS
 */
export function isEncryptedMediaUrl(url: string | null | undefined): boolean {
    if (!url) return false;
    return url.includes('enc=1') || url.includes('/api/media/view/');
}

export async function downloadMedia(url: string, filename: string = "orbit-media") {
    const res = await orbitFetch(url);
    if (!res.ok) throw new Error("Fetch failed");
    let blob = await res.blob();
    if (isEncryptedMediaUrl(url)) {
        const token = url.split('/api/media/view/')[1]?.split('?')[0];
        if (token) {
            const payload = decodeMediaToken(token);
            if (payload?.iv && payload?.path) {
                blob = await decryptMediaBlob(blob, payload.path, payload.iv, payload.mime || 'image/jpeg');
            }
        }
    }
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(blobUrl);
}

export async function getKeyFingerprint(keyB64?: string): Promise<string | null> {
    const k = keyB64 ?? await getStoredMediaKeyAsync();
    if (!k) return null;
    try {
        const raw = fromBase64Url(k);
        const hash = await crypto.subtle.digest('SHA-256', raw.buffer as ArrayBuffer);
        return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
    } catch { return null; }
}

export function createRecoveryKitBlob() {
    const mediaKey = getStoredMediaKey();
    if (!mediaKey) throw new Error("No key");
    const payload = {
        version: RECOVERY_KIT_VERSION,
        createdAt: new Date().toISOString(),
        type: "orbit-privacy-recovery-kit",
        mediaKey,
    };
    return new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
}

export async function importRecoveryKit(file: File) {
    const raw = await file.text();
    const parsed = JSON.parse(raw);
    if (!parsed?.mediaKey) throw new Error("Invalid kit");
    setStoredMediaPassphrase(parsed.mediaKey);
}

export async function createEscrowBlob(passphrase: string): Promise<EscrowBlob> {
    // Placeholder for real escrow logic to keep file small/fixed
    return {
        version: 1,
        fingerprintHex: await getKeyFingerprint(),
        saltB64: "", ivB64: "", ciphertextB64: ""
    };
}

export async function decryptEscrowBlob(blob: EscrowBlob, passphrase: string): Promise<void> {
    // Placeholder (Real implementation would decrypt blob with passphrase and call setStoredMediaPassphrase)
    console.log("Decrypting escrow blob with passphrase...", passphrase);
}
