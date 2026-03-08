import * as FileSystem from 'expo-file-system';
import { useState, useEffect } from 'react';

/**
 * Signal-Style Persistent Media Engine
 * This handles permanent local storage of media to mimic the "instant" feel
 * of premium apps like WhatsApp and Signal.
 */

// @ts-ignore
const BASE_DIR = FileSystem.documentDirectory || FileSystem.cacheDirectory;
const MEDIA_PATH = `${BASE_DIR}persistent_media/`;

// Ensure directory exists
const ensureDir = async () => {
    const dirInfo = await FileSystem.getInfoAsync(MEDIA_PATH);
    if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(MEDIA_PATH, { intermediates: true });
    }
};

export const getPersistentPath = (id: string) => {
    return `${MEDIA_PATH}${id}`;
};

export const ensureMediaPersistent = async (id: string, remoteUrl: string) => {
    try {
        await ensureDir();
        const localPath = getPersistentPath(id);
        const info = await FileSystem.getInfoAsync(localPath);

        if (!info.exists) {
            console.log(`[MediaEngine] Persisting: ${id}`);
            await FileSystem.downloadAsync(remoteUrl, localPath);
        }
        return localPath;
    } catch (e) {
        console.error(`[MediaEngine] Failed to persist ${id}:`, e);
        return remoteUrl;
    }
};

export const usePersistentMedia = (id: string | undefined, remoteUrl: string | undefined) => {
    const [source, setSource] = useState<string | undefined>(remoteUrl);

    useEffect(() => {
        if (!id || !remoteUrl) {
            setSource(remoteUrl);
            return;
        }

        let isMounted = true;

        const checkLocal = async () => {
            const localPath = getPersistentPath(id);
            const info = await FileSystem.getInfoAsync(localPath);

            if (info.exists && isMounted) {
                setSource(localPath);
            } else {
                // Background download for next time
                ensureMediaPersistent(id, remoteUrl);
                if (isMounted) setSource(remoteUrl);
            }
        };

        checkLocal();

        return () => { isMounted = false; };
    }, [id, remoteUrl]);

    return source;
};
