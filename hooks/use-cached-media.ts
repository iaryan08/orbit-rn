import { useState, useEffect } from 'react';
import { MediaCacheEngine } from '@/lib/client/media-cache/engine';

export function useCachedMedia(userId: string | undefined, src: string | null, blobDecrypter: () => Promise<Blob | null>) {
    const [mediaUrl, setMediaUrl] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        let isMounted = true;
        let objectUrl: string | null = null;

        const loadMedia = async () => {
            if (!userId || !src) return;

            setIsLoading(true);
            setError(null);

            try {
                // 1. Try to read from local MCE (Native/IDB)
                const cached = await MediaCacheEngine.readBlob(userId, src);

                if (cached && isMounted) {
                    // Cache Hit: Create URL from disk/IDB blob immediately
                    objectUrl = URL.createObjectURL(cached.blob);
                    setMediaUrl(objectUrl);
                    setIsLoading(false);
                    return;
                }

                // 2. Cache Miss: Execute the heavy decryption/network task
                const freshBlob = await blobDecrypter();

                if (!freshBlob) {
                    throw new Error("Failed to load or decrypt media");
                }

                // 3. Store the fresh blob in MCE for next time
                await MediaCacheEngine.writeBlob(userId, src, freshBlob, src);

                if (isMounted) {
                    objectUrl = URL.createObjectURL(freshBlob);
                    setMediaUrl(objectUrl);
                }
            } catch (err: any) {
                if (isMounted) setError(err);
            } finally {
                if (isMounted) setIsLoading(false);
            }
        };

        loadMedia();

        return () => {
            isMounted = false;
            // Clean up temporary ObjectURLs to prevent RAM leaks
            if (objectUrl) {
                URL.revokeObjectURL(objectUrl);
            }
        };
    }, [userId, src]);

    return { mediaUrl, isLoading, error };
}
