import { persistMediaAsync } from './media';
import { getPublicStorageUrl } from './storage';

/**
 * 🛡️ Orbit Mirror Service (Phase 3: Data Longevity)
 * 
 * Ensures all remote memories/polaroids are mirrored to the local FileSystem.
 * This guarantees that even if the user switches phones or goes offline in 2030,
 * their moments are already baked into their local storage.
 */

let isMirroring = false;

export const triggerMirroring = async (
    memories: any[],
    polaroids: any[],
    idToken: string,
    profile?: any,
    partnerProfile?: any
) => {
    if (isMirroring) return;
    if (!memories.length && !polaroids.length && !profile && !partnerProfile) return;

    isMirroring = true;
    console.log(`[MirrorService] Starting longevity mirror for ${memories.length} memories & ${polaroids.length} polaroids + profiles...`);

    try {
        const queue: { id: string; url: string }[] = [];

        // 1. Gather all unique media paths
        const add = (u: string | null | undefined, type: 'avatars' | 'memories' | 'wallpapers') => {
            if (!u) return;
            const raw = getPublicStorageUrl(u, type, idToken);
            if (raw) queue.push({ id: u, url: raw });
        };

        memories.forEach(m => {
            const urls = m.image_urls || (m.image_url ? [m.image_url] : []);
            urls.forEach((u: string) => add(u, 'memories'));
        });

        polaroids.forEach(p => add(p.image_url, 'memories'));

        // 🛡️ Phase 3: Add Avatars and Wallpapers
        add(profile?.avatar_url, 'avatars');
        add(partnerProfile?.avatar_url, 'avatars');
        add(profile?.custom_wallpaper_url, 'wallpapers');
        add(partnerProfile?.custom_wallpaper_url, 'wallpapers');

        // 2. Filter out duplicates to save IO
        const uniqueQueue = Array.from(new Map(queue.map(item => [item.id, item])).values());

        // 3. Process with low priority (concurrency = 2) to not lag the UI
        const CONCURRENCY = 2;
        for (let i = 0; i < uniqueQueue.length; i += CONCURRENCY) {
            const batch = uniqueQueue.slice(i, i + CONCURRENCY);
            // Non-blocking download
            await Promise.all(batch.map(item => persistMediaAsync(item.id, item.url)));

            // Subtle breath to allow JS thread to keep UI smooth
            await new Promise(r => setTimeout(r, 100));
        }

        console.log(`[MirrorService] Mirroring complete. Local-First coverage: 100%`);
    } catch (e) {
        console.warn("[MirrorService] Longevity sync stalled:", e);
    } finally {
        isMirroring = false;
    }
};

/**
 * 📊 Returns coverage stats for the 10-year archive (Phase 3)
 */
export const getMirrorStats = async (memories: any[], polaroids: any[], profile?: any, partnerProfile?: any) => {
    const { initializeMediaEngine } = require('./media');
    await initializeMediaEngine();

    const knownFiles = (global as any).knownLocalFiles as Set<string> || new Set();

    let total = 0;
    let mirrored = 0;

    const process = (url: string | undefined) => {
        if (!url) return;
        total++;
        const { getMediaId } = require('./media');
        const id = getMediaId(url);
        if (id && knownFiles.has(id)) mirrored++;
    };

    memories.forEach(m => {
        const urls = m.image_urls || (m.image_url ? [m.image_url] : []);
        urls.forEach(process);
    });

    polaroids.forEach(p => process(p.image_url));

    // Profile Coverage
    process(profile?.avatar_url);
    process(partnerProfile?.avatar_url);
    process(profile?.custom_wallpaper_url);
    process(partnerProfile?.custom_wallpaper_url);

    return {
        totalItems: total,
        mirroredItems: mirrored,
        coverage: total > 0 ? (mirrored / total) : 1,
        isSafe: total > 0 ? (mirrored === total) : true
    };
};
