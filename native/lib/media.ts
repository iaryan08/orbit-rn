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

const ensureParentDir = async (path: string) => {
    try {
        if (!BASE_DIR) return;
        const lastSlash = path.lastIndexOf('/');
        if (lastSlash <= 0) return;
        const dir = path.slice(0, lastSlash + 1);
        const info = await FileSystem.getInfoAsync(dir);
        if (!info.exists) {
            await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
        }
    } catch (e) { }
};

// In-Memory map of confirmed local files to avoid the "async check" flicker
const knownLocalFiles = new Set<string>();
const inFlightDownloads = new Map<string, Promise<string>>();
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

/**
 * Unified ID Generator: Extracts a content-stable ID from a URL (e.g., filename).
 * Now supports query parameters to allow cache-busting.
 */
export const getMediaId = (url: string | undefined): string | undefined => {
    if (!url) return undefined;
    try {
        const [path, query] = url.split('?');
        const segments = path.split('/');
        const filename = segments[segments.length - 1];
        
        // 🛡️ Collision Guard: Include the parent directory (bucket name) to avoid collisions
        // e.g., 'memories/1.jpg' and 'polaroids/1.jpg' should be unique.
        const parent = segments.length > 1 ? segments[segments.length - 2] : '';
        const base = `${parent}_${filename}`.replace(/[^a-zA-Z0-9._-]/g, '_');
        
        if (query) {
            // Filter out authentication tokens from ID generation.
            // They change frequently and shouldn't cause redundant local files.
            const queryParams = query.split('&');
            const stableParams = queryParams.filter(p => !p.startsWith('auth='));
            
            if (stableParams.length > 0) {
                const stableQuery = stableParams.join('&');
                const queryHash = stableQuery.replace(/[^a-zA-Z0-9]/g, '').slice(-8);
                return `${base}_${queryHash}`;
            }
        }
        return base;
    } catch {
        return url.slice(-20).replace(/[^a-zA-Z0-9._-]/g, '_'); // Fallback
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

    const existingDownload = inFlightDownloads.get(id);
    if (existingDownload) {
        return existingDownload;
    }

    const localPath = getPersistentPath(id);
    const downloadPromise = (async () => {
        try {
            // 1. Double check disk (atomic guard)
            const info = await FileSystem.getInfoAsync(localPath);
            if (info.exists && info.size > 0) {
                knownLocalFiles.add(id);
                return localPath;
            }

            // 2. Download to local
            console.log(`[MediaEngine] Starting download: ${id}`);
            await ensureParentDir(localPath);
            const result = await FileSystem.downloadAsync(remoteUrl, localPath);
            if (result.status === 200) {
                knownLocalFiles.add(id);
                return localPath;
            }
        } catch (e) {
            console.warn("[MediaEngine] Persist failed:", e);
        } finally {
            inFlightDownloads.delete(id);
        }
        return remoteUrl;
    })();

    inFlightDownloads.set(id, downloadPromise);
    return downloadPromise;
};

export const usePersistentMedia = (idOrUrl: string | undefined, remoteUrl: string | undefined, isVisible: boolean = false) => {
    // 1. Content-stable ID
    const id = getMediaId(idOrUrl || remoteUrl);
    const localPath = id ? getPersistentPath(id) : undefined;

    // 2. Initial state: check if we ALREADY know this is local
    const isKnownLocal = !!id && knownLocalFiles.has(id);
    const [source, setSource] = useState<string | undefined>(isKnownLocal ? localPath : undefined);

    const hasAttemptedDownload = useRef(false);
    const lastAttemptedUrl = useRef<string | undefined>(undefined);
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
            // Reset attempt if URL changed (e.g. token added)
            const isNewUrl = remoteUrl !== lastAttemptedUrl.current;
            if (isVisible && (isNewUrl || !hasAttemptedDownload.current)) {
                if (debounceTimer.current) clearTimeout(debounceTimer.current);

                debounceTimer.current = setTimeout(async () => {
                    if (!isMounted) return;
                    hasAttemptedDownload.current = true;
                    lastAttemptedUrl.current = remoteUrl;
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
