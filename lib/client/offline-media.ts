import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';

export class OfflineMediaManager {
    private static MEDIA_DIR = 'orbit_media';

    /**
     * Save a blob or base64 to the native filesystem for offline use.
     * Returns the local file path.
     */
    static async saveMediaOffline(fileName: string, data: string): Promise<string | null> {
        if (Capacitor.getPlatform() === 'web') return null;

        try {
            // Ensure directory exists
            try {
                await Filesystem.mkdir({
                    path: this.MEDIA_DIR,
                    directory: Directory.Data,
                    recursive: true
                });
            } catch (e) { }

            const filePath = `${this.MEDIA_DIR}/${fileName}`;

            await Filesystem.writeFile({
                path: filePath,
                data: data,
                directory: Directory.Data,
            });

            const uri = await Filesystem.getUri({
                path: filePath,
                directory: Directory.Data
            });

            return uri.uri;
        } catch (e) {
            console.error('Error saving media offline:', e);
            return null;
        }
    }

    /**
     * Get the native URI for a locally stored file.
     */
    static async getLocalUri(fileName: string): Promise<string | null> {
        if (Capacitor.getPlatform() === 'web') return null;

        try {
            const { uri } = await Filesystem.getUri({
                path: `${this.MEDIA_DIR}/${fileName}`,
                directory: Directory.Data
            });
            return uri;
        } catch (e) {
            return null;
        }
    }

    /**
     * Delete a locally stored file.
     */
    static async deleteLocalMedia(fileName: string): Promise<void> {
        if (Capacitor.getPlatform() === 'web') return;

        try {
            await Filesystem.deleteFile({
                path: `${this.MEDIA_DIR}/${fileName}`,
                directory: Directory.Data
            });
        } catch (e) { }
    }
    /**
     * Download a remote resource and save it locally.
     * Returns the local URI.
     */
    static async cacheRemoteResource(url: string): Promise<string | null> {
        if (!url || Capacitor.getPlatform() === 'web') return null;
        if (url.startsWith('file://') || url.startsWith('content://')) return url; // Already local

        try {
            const response = await fetch(url);
            const blob = await response.blob();

            // Convert blob to base64 for Filesystem.writeFile
            const reader = new FileReader();
            const base64Data = await new Promise<string>((resolve, reject) => {
                reader.onloadend = () => {
                    const base64 = (reader.result as string).split(',')[1];
                    resolve(base64);
                };
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });

            const fileName = `cached_${Date.now()}_${Math.random().toString(36).substring(7)}${this.getExtension(url)}`;
            return await this.saveMediaOffline(fileName, base64Data);
        } catch (e) {
            console.error('Error caching remote resource:', e);
            return null;
        }
    }

    private static getExtension(url: string): string {
        try {
            const urlObj = new URL(url);
            const pathname = urlObj.pathname;
            const ext = pathname.split('.').pop();
            if (ext && ext.length < 5) return `.${ext}`;
        } catch (e) { }
        return '.jpg';
    }
}
