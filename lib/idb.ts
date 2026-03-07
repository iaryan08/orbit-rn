export const setCustomWallpaper = async (base64String: string) => {
    return new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('orbit_db', 1);

        req.onupgradeneeded = (e) => {
            const db = req.result;
            if (!db.objectStoreNames.contains('wallpapers')) {
                db.createObjectStore('wallpapers');
            }
        };

        req.onsuccess = () => {
            const db = req.result;
            // Handle if upgrading didn't run, e.g. concurrent open
            try {
                const tx = db.transaction('wallpapers', 'readwrite');
                const store = tx.objectStore('wallpapers');
                store.put(base64String, 'custom_bg');

                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
            } catch (err) {
                // If store doesn't exist, we might need to recreate db or just ignore
                console.warn('Could not store wallpaper:', err);
                resolve();
            }
        };
        req.onerror = () => reject(req.error);
    });
};

export const getCustomWallpaper = async (): Promise<string | null> => {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open('orbit_db', 1);

        req.onupgradeneeded = (e) => {
            const db = req.result;
            if (!db.objectStoreNames.contains('wallpapers')) {
                db.createObjectStore('wallpapers');
            }
        };

        req.onsuccess = () => {
            const db = req.result;
            try {
                const tx = db.transaction('wallpapers', 'readonly');
                const store = tx.objectStore('wallpapers');
                const getReq = store.get('custom_bg');

                getReq.onsuccess = () => resolve(getReq.result || null);
                getReq.onerror = () => resolve(null); // fail gracefully
            } catch (err) {
                resolve(null);
            }
        };
        req.onerror = () => resolve(null);
    });
};

export const clearCustomWallpaper = async () => {
    return new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('orbit_db', 1);
        req.onupgradeneeded = (e) => {
            const db = req.result;
            if (!db.objectStoreNames.contains('wallpapers')) {
                db.createObjectStore('wallpapers');
            }
        };
        req.onsuccess = () => {
            const db = req.result;
            try {
                // Check if store actually exists before trying to open a transaction
                if (!db.objectStoreNames.contains('wallpapers')) {
                    return resolve();
                }
                const tx = db.transaction('wallpapers', 'readwrite');
                const store = tx.objectStore('wallpapers');
                store.delete('custom_bg');
                tx.oncomplete = () => resolve();
                tx.onerror = () => resolve();
            } catch (e) {
                resolve();
            }
        };
        req.onerror = () => resolve();
    });
};
