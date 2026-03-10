import * as FileSystem from 'expo-file-system/legacy';
import { useState, useEffect, useRef } from 'react';

/**
 * Orbit Premium Media Engine (V3)
 * Optimized for Instagram-style performance:
 * 1. Zero-Flicker Bootstrap (via Sync Map)
 * 2. Visibility-Gated Networking (Prevents 10Mbps spikes)
 * 3. Atomic Local Persistence
 */

const BASE_DIR = FileSystem.documentDirectory || FileSystem.cacheDirectory || '';
const MEDIA_PATH = `${BASE_DIR}persistent_media/`;

// Ensure directory exists
const ensureDir = async () => {
    try {
        if (!BASE_DIR) return;
        const dirInfo = await FileSystem.getInfoAsync(MEDIA_PATH);
        if (!dirInfo.exists) {
            await FileSystem.makeDirectoryAsync(MEDIA_PATH, { intermediates: true });
        }
    } catch (e) { }
};

// In-Memory map of confirmed local files to avoid the "async check" flicker
const knownLocalFiles = new Set<string>();
let isInitialized = false;

/**
 * Boot-time scan: populate knownLocalFiles instantly so first render
 * of any media component can be synchronous if the file is on disk.
 */
export const initializeMediaEngine = async () => {
    if (isInitialized) return;
    try {
        await ensureDir();
        const files = await FileSystem.readDirectoryAsync(MEDIA_PATH);
        files.forEach(f => knownLocalFiles.add(f));
        isInitialized = true;
        console.log(`[MediaEngine] Initialized with ${files.length} local files.`);
    } catch (e) {
        console.warn("[MediaEngine] Init failed:", e);
    }
};

// Start initialization immediately
initializeMediaEngine();

/**
 * Unified ID Generator: Extracts a content-stable ID from a URL (e.g., filename).
 * This ensures that the same media viewed on different screens (Dashboard vs Gallery)
 * resolves to the same local file, preventing duplicate downloads and spikes.
 */
export const getMediaId = (url: string | undefined): string | undefined => {
    if (!url) return undefined;
    try {
        // Extract the core filename before any query params
        const path = url.split('?')[0];
        const segments = path.split('/');
        const filename = segments[segments.length - 1];
        // Remove common URL encoding artifacts
        return decodeURIComponent(filename).replace(/[^a-zA-Z0-9._-]/g, '_');
    } catch {
        return url.slice(-20); // Fallback
    }
};

export const getPersistentPath = (id: string) => {
    const safeId = id.includes('.') ? id : `${id}.bin`; // Ensure we don't mess up folders
    return `${MEDIA_PATH}${safeId}`;
};

/**
 * Downloads media to local storage ONLY if it doesn't exist.
 */
export const persistMediaAsync = async (id: string, remoteUrl: string) => {
    if (!id || !remoteUrl || !BASE_DIR) return remoteUrl;

    const localPath = getPersistentPath(id);
    try {
        // 1. Double check disk (atomic guard)
        const info = await FileSystem.getInfoAsync(localPath);
        if (info.exists && info.size > 0) {
            knownLocalFiles.add(id);
            return localPath;
        }

        // 2. Download to local
        console.log(`[MediaEngine] Starting download: ${id}`);
        const result = await FileSystem.downloadAsync(remoteUrl, localPath);
        if (result.status === 200) {
            knownLocalFiles.add(id);
            return localPath;
        }
    } catch (e) {
        console.warn("[MediaEngine] Persist failed:", e);
    }
    return remoteUrl;
};

export const usePersistentMedia = (idOrUrl: string | undefined, remoteUrl: string | undefined, isVisible: boolean = false) => {
    // 1. Content-stable ID
    const id = getMediaId(idOrUrl || remoteUrl);
    const localPath = id ? getPersistentPath(id) : undefined;

    // 2. Initial state: check if we ALREADY know this is local
    const isKnownLocal = !!id && knownLocalFiles.has(id);
    const [source, setSource] = useState<string | undefined>(isKnownLocal ? localPath : undefined);

    const hasAttemptedDownload = useRef(false);
    const debounceTimer = useRef<any>(null);

    useEffect(() => {
        if (!id || !remoteUrl || !BASE_DIR) return;

        let isMounted = true;

        const sync = async () => {
            // Already matched?
            if (isKnownLocal && source === localPath) return;

            // 1. Runtime Disk Check (if not in sync map yet)
            if (!knownLocalFiles.has(id)) {
                try {
                    const info = await FileSystem.getInfoAsync(localPath!);
                    if (info.exists && info.size > 0) {
                        knownLocalFiles.add(id);
                        if (isMounted) setSource(localPath);
                        return;
                    }
                } catch (e) { }
            } else {
                if (isMounted) setSource(localPath);
                return;
            }

            // 2. TRIGGER NETWORK: Only if visible AND not already local
            // Added 400ms Debounce: If user is just swiping through, don't trigger the 10Mbps spike!
            if (isVisible && !hasAttemptedDownload.current) {
                if (debounceTimer.current) clearTimeout(debounceTimer.current);

                debounceTimer.current = setTimeout(async () => {
                    if (!isMounted) return;
                    hasAttemptedDownload.current = true;
                    const final = await persistMediaAsync(id, remoteUrl);
                    if (isMounted) setSource(final);
                }, 400);
            }
        };

        sync();

        return () => {
            isMounted = false;
            if (debounceTimer.current) clearTimeout(debounceTimer.current);
        };
    }, [id, remoteUrl, isVisible, isKnownLocal, source]);

    return source;
};
