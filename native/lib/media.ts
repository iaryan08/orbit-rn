import * as FileSystem from 'expo-file-system/legacy';
import { useState, useEffect } from 'react';

/**
 * Super-stable Media Engine
 * Priority: 1. Remote Visibility, 2. Background Persistence
 */

// @ts-ignore
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
    } catch (e) {
        // Silently continue
    }
};

export const getPersistentPath = (id: string) => {
    return `${MEDIA_PATH}${id}`;
};

export const ensureMediaPersistent = async (id: string, remoteUrl: string) => {
    if (!id || !remoteUrl || !BASE_DIR) return remoteUrl;

    const localPath = getPersistentPath(id);
    try {
        await ensureDir();
        const info = await FileSystem.getInfoAsync(localPath);
        if (info.exists && info.size > 0) {
            return localPath;
        }

        // Just trigger background persistence, don't wait for it
        FileSystem.downloadAsync(remoteUrl, localPath).catch(() => { });
        return remoteUrl;
    } catch (e) {
        return remoteUrl;
    }
};

export const usePersistentMedia = (id: string | undefined, remoteUrl: string | undefined) => {
    // START with remoteUrl ALWAYS to ensure the image SHOWS immediately
    const [source, setSource] = useState<string | undefined>(remoteUrl);

    useEffect(() => {
        // Sync source when remoteUrl changes
        setSource(remoteUrl);

        if (!id || !remoteUrl || !BASE_DIR) return;

        let isMounted = true;

        const checkLocal = async () => {
            const localPath = getPersistentPath(id);
            try {
                const info = await FileSystem.getInfoAsync(localPath);
                if (info.exists && info.size > 0) {
                    if (isMounted) setSource(localPath);
                } else {
                    // Try to persist for next session
                    ensureMediaPersistent(id, remoteUrl);
                }
            } catch (e) {
                if (isMounted) setSource(remoteUrl);
            }
        };

        checkLocal();

        return () => { isMounted = false; };
    }, [id, remoteUrl]);

    return source;
};
