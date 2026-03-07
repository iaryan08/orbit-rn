import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';

export interface CacheMetadata {
    url: string;
    size: number;
    lastAccessed: string;
    expiresAt?: string;
    updatedAt?: string;
}

const CACHE_DIR = 'media_cache';

async function sha256Hash(message: string): Promise<string> {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export class MediaCacheEngine {
    private static isNative = Capacitor.isNativePlatform();

    static async initUserDir(userId: string) {
        if (!this.isNative) return;
        try {
            await Filesystem.mkdir({
                path: `${CACHE_DIR}/${userId}`,
                directory: Directory.Data,
                recursive: true
            });
        } catch (e) {
            // Directory likely already exists
        }
    }

    static async getHash(key: string) {
        return sha256Hash(key);
    }

    static async getFilePath(userId: string, key: string) {
        const hash = await this.getHash(key);
        return `${CACHE_DIR}/${userId}/${hash}.enc`;
    }

    static async getMetaPath(userId: string, key: string) {
        const hash = await this.getHash(key);
        return `${CACHE_DIR}/${userId}/${hash}.meta.json`;
    }

    /**
     * Stores an encrypted blob to the local filesystem or IndexedDB (Cache API).
     */
    static async writeBlob(userId: string, key: string, blob: Blob, originalUrl: string, updatedAt?: string) {
        if (this.isNative) {
            try {
                await this.initUserDir(userId);

                // Write the blob via a base64 string
                const content = await this.blobToBase64(blob);
                const path = await this.getFilePath(userId, key);
                const metaPath = await this.getMetaPath(userId, key);

                await Filesystem.writeFile({
                    path,
                    data: content,
                    directory: Directory.Data
                });

                const meta: CacheMetadata = {
                    url: originalUrl,
                    size: blob.size,
                    lastAccessed: new Date().toISOString(),
                    updatedAt
                };

                await Filesystem.writeFile({
                    path: metaPath,
                    data: JSON.stringify(meta),
                    directory: Directory.Data,
                    encoding: Encoding.UTF8
                });
            } catch (err) {
                console.warn('[MCE] Native write error:', err);
            }
        } else {
            // Web IDB Driver (Cache API)
            try {
                const cache = await caches.open(`orbit-media-${userId}`);
                const req = new Request(`orbit-cache://${key}`);
                const res = new Response(blob, {
                    headers: {
                        'X-Original-Url': originalUrl,
                        'X-Updated-At': updatedAt || ''
                    }
                });
                await cache.put(req, res);
            } catch (err) {
                console.warn('[MCE] Web write error:', err);
            }
        }
    }

    /**
     * Retrieves a blob from the local storage cache.
     * Returns the raw (encrypted) blob to be decrypted by the app layer.
     */
    static async readBlob(userId: string, key: string): Promise<{ blob: Blob, meta: CacheMetadata } | null> {
        if (this.isNative) {
            try {
                const path = await this.getFilePath(userId, key);
                const metaPath = await this.getMetaPath(userId, key);

                const metaFile = await Filesystem.readFile({
                    path: metaPath,
                    directory: Directory.Data,
                    encoding: Encoding.UTF8
                });

                const meta: CacheMetadata = JSON.parse(metaFile.data as string);
                meta.lastAccessed = new Date().toISOString();

                // Fire-and-forget update to lastAccessed
                Filesystem.writeFile({
                    path: metaPath,
                    data: JSON.stringify(meta),
                    directory: Directory.Data,
                    encoding: Encoding.UTF8
                }).catch(() => { });

                // FAST PATH: Read via Capacitor URL routing rather than base64 bridging memory bloat
                const stat = await Filesystem.stat({
                    path,
                    directory: Directory.Data
                });

                const fileUri = Capacitor.convertFileSrc(stat.uri);
                const response = await fetch(fileUri);
                // Capacitor filesystem local fetches don't properly set mime-types for generic .enc files,
                // But we don't care since we track mime types in the app logic during decryption.
                const blob = await response.blob();

                return { blob, meta };
            } catch (e) {
                return null;
            }
        } else {
            try {
                const cache = await caches.open(`orbit-media-${userId}`);
                const req = new Request(`orbit-cache://${key}`);
                const res = await cache.match(req);
                if (!res) return null;

                const blob = await res.blob();
                const meta: CacheMetadata = {
                    url: res.headers.get('X-Original-Url') || '',
                    size: blob.size,
                    lastAccessed: new Date().toISOString(),
                    updatedAt: res.headers.get('X-Updated-At') || undefined
                };

                return { blob, meta };
            } catch (e) {
                return null;
            }
        }
    }

    /**
     * Delete a single entry from the cache
     */
    static async deleteEntry(userId: string, key: string) {
        if (this.isNative) {
            try {
                const path = await this.getFilePath(userId, key);
                const metaPath = await this.getMetaPath(userId, key);
                await Filesystem.deleteFile({ path, directory: Directory.Data }).catch(() => { });
                await Filesystem.deleteFile({ path: metaPath, directory: Directory.Data }).catch(() => { });
            } catch (e) { }
        } else {
            try {
                const cache = await caches.open(`orbit-media-${userId}`);
                await cache.delete(new Request(`orbit-cache://${key}`));
            } catch (e) { }
        }
    }

    /**
     * Entirely wipe the user's local silo (Security feature on sign out)
     */
    static async wipeUserCache(userId: string) {
        if (this.isNative) {
            try {
                await Filesystem.rmdir({
                    path: `${CACHE_DIR}/${userId}`,
                    directory: Directory.Data,
                    recursive: true
                });
            } catch (e) { }
        } else {
            await caches.delete(`orbit-media-${userId}`);
        }
    }

    /**
     * Calculate how many bytes the media cache is using
     */
    static async getUsageBytes(userId: string): Promise<number> {
        if (this.isNative) {
            try {
                let totalSize = 0;
                const dir = await Filesystem.readdir({
                    path: `${CACHE_DIR}/${userId}`,
                    directory: Directory.Data
                });

                for (const file of dir.files) {
                    // Capacitor v6+ returns fileInfo on readdir
                    if (file.size) {
                        totalSize += file.size;
                    }
                }
                return totalSize;
            } catch {
                return 0; // directory may not exist yet
            }
        } else {
            let totalSize = 0;
            try {
                const cache = await caches.open(`orbit-media-${userId}`);
                const keys = await cache.keys();
                // Browsers compress cache, but we will make an educated guess 
                // by fetching content-length headers (or using StorageManager if available)
                for (const req of keys) {
                    const res = await cache.match(req);
                    if (res) {
                        const blob = await res.blob();
                        totalSize += blob.size;
                    }
                }
            } catch { }
            return totalSize;
        }
    }

    /**
     * Convert Blob to Base64 for Capacitor writeFile (which requires a base64 string)
     */
    private static blobToBase64(blob: Blob): Promise<string> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = reject;
            reader.onload = () => {
                const result = reader.result as string;
                // FileReader gives us "data:image/png;base64,iVBORw0KGgo..."
                const b64 = result.split(',')[1];
                resolve(b64);
            };
            reader.readAsDataURL(blob);
        });
    }
}
