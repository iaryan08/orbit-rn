import { NextRequest, NextResponse } from 'next/server'
import { decodeMediaToken } from '@/lib/media-tokens'
import { requireUser } from '@/lib/firebase/auth-server'
import { adminDb, adminAuth } from '@/lib/firebase/admin'

// ─────────────────────────────────────────────────────────────────────────────
// Auth cache — "authorize once while app is open"
// ─────────────────────────────────────────────────────────────────────────────

interface CachedMediaUser {
    userId: string;
    coupleId: string | null;
    expiresAt: number; // ms
}

interface CachedWinner {
    source: 'r2' | 'supa';
    winnerPath: string;
}

const mediaAuthCache = new Map<string, CachedMediaUser>();
const mediaWinnerCache = new Map<string, CachedWinner>(); // Bucket:Path -> Winner Info
const mediaNotFoundCache = new Map<string, number>(); // Bucket:Path -> Expiry

// Clean up stale entries periodically
if (typeof setInterval !== 'undefined') {
    setInterval(() => {
        const now = Date.now();
        for (const [k, v] of mediaAuthCache) {
            if (v.expiresAt <= now) mediaAuthCache.delete(k);
        }
    }, 5 * 60 * 1000);
}

/**
 * Resolves the authenticated user via Firebase and Firestore.
 */
async function resolveMediaUser(
    request: NextRequest
): Promise<CachedMediaUser | null> {
    const authHeader = request.headers.get('authorization') || '';
    const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : (request.nextUrl.searchParams.get('auth') || '');

    if (!bearerToken) return null;

    // 1. Check cache first
    const cached = mediaAuthCache.get(bearerToken);
    if (cached && cached.expiresAt > Date.now()) return cached;

    // 2. Verify Firebase Token
    let user;
    try {
        user = await adminAuth.verifyIdToken(bearerToken);
    } catch (err) {
        console.error('[MediaView] verifyIdToken failed:', err);
        return null;
    }
    if (!user) return null;

    // 3. Fetch profile from Firestore
    try {
        const userDoc = await adminDb.collection('users').doc(user.uid).get();
        const profileData = userDoc.data();

        const entry: CachedMediaUser = {
            userId: user.uid,
            coupleId: profileData?.couple_id ?? null,
            expiresAt: (user.exp || 0) * 1000 || Date.now() + 10 * 60 * 1000,
        };
        mediaAuthCache.set(bearerToken, entry);
        return entry;
    } catch (err) {
        console.error('[MediaView] Firestore lookup error:', err);
        return null;
    }
}

// ─────────────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
    let bucket = request.nextUrl.searchParams.get('bucket') || ''
    let path = request.nextUrl.searchParams.get('path') || ''

    const sanitizeObjectPath = (input: string) => {
        let value = String(input || '').trim()
        try {
            value = decodeURIComponent(value)
        } catch {
            // keep raw if malformed encoding
        }
        return value
            .replace(/^\/+/, '')
            .split('?')[0]
            .split('#')[0]
            .trim()
    }

    if (!bucket && !path) {
        const urlObj = new URL(request.url)
        const pathname = urlObj.pathname.replace(/^\/api\/media\/view\//, "").replace(/^\/+/, "")

        if (pathname) {
            const decoded = decodeMediaToken(pathname);
            if (decoded && decoded.bucket && decoded.path) {
                bucket = decoded.bucket;
                path = decoded.path;
            } else {
                const parts = pathname.split('/').filter(Boolean)
                if (parts.length >= 2) {
                    bucket = parts[0]
                    path = parts.slice(1).join('/')
                } else if (parts.length === 1) {
                    bucket = 'memories'
                    path = parts[0]
                }
            }
        }
    }

    if (!bucket || !path) {
        return NextResponse.json({ error: 'Missing bucket or path' }, { status: 400 })
    }

    path = sanitizeObjectPath(path)
    if (!path) {
        return NextResponse.json({ error: 'Missing object path' }, { status: 400 })
    }

    const mediaUser = await resolveMediaUser(request);

    if (!mediaUser) {
        console.warn(`[MediaView] 401 Unauthorized for ${bucket}/${path}`);
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { coupleId: userCoupleId, userId: currentUserId } = mediaUser;

    const cdnUrl = process.env.NEXT_PUBLIC_CDN_URL;
    const r2Url = process.env.NEXT_PUBLIC_UPLOAD_URL;
    const r2Secret = process.env.NEXT_PUBLIC_UPLOAD_SECRET;
    const fetchBaseUrls = Array.from(new Set([
        (r2Url || '').replace(/\/$/, ''),
        (cdnUrl || '').replace(/\/$/, ''),
    ].filter(Boolean)));
    let blob: Blob | null = null;

    const CACHE_KEY = `${bucket}:${path}`;

    // Server-side negative caching (prevent CF worker spam)
    if (mediaNotFoundCache.has(CACHE_KEY)) {
        const expiresAt = mediaNotFoundCache.get(CACHE_KEY)!;
        if (Date.now() < expiresAt) {
            return new NextResponse(JSON.stringify({ error: "Media not found (cached)" }), {
                status: 404,
                headers: {
                    "Content-Type": "application/json",
                    "Cache-Control": "public, max-age=300, stale-while-revalidate=600"
                }
            });
        } else {
            mediaNotFoundCache.delete(CACHE_KEY);
        }
    }

    const cachedWinner = mediaWinnerCache.get(CACHE_KEY);

    if (cachedWinner) {
        try {
            if (cachedWinner.source === 'r2' && fetchBaseUrls.length > 0) {
                // Determine which baseUrl matched this winnerPath (it's either bucket/path or just path)
                for (const baseUrl of fetchBaseUrls) {
                    const isUploadWorker = baseUrl.includes('upload');
                    const target = isUploadWorker
                        ? `${baseUrl}/${cachedWinner.winnerPath.startsWith(bucket + '/') ? cachedWinner.winnerPath : bucket + '/' + cachedWinner.winnerPath}`
                        : `${baseUrl}/${cachedWinner.winnerPath.startsWith(bucket + '/') ? cachedWinner.winnerPath.replace(new RegExp(`^${bucket}/`), '') : cachedWinner.winnerPath}`;

                    const res = await fetch(target, {
                        headers: isUploadWorker && r2Secret ? {
                            "Authorization": `Bearer ${r2Secret}`,
                            "X-Orbit-R2-Secret": r2Secret
                        } : {},
                        cache: 'no-store'
                    });
                    if (res.ok) {
                        blob = await res.blob();
                        break;
                    }
                }
            }
            if (blob) {
                return new NextResponse(blob, {
                    status: 200,
                    headers: {
                        "content-type": blob.type || "application/octet-stream",
                        "cache-control": "public, max-age=31536000, immutable",
                        "x-orbit-media-source": `cached-${cachedWinner.source}`,
                    },
                });
            }
        } catch (e) {
            mediaWinnerCache.delete(CACHE_KEY);
        }
    }

    const candidates = [
        path,
        // If path is just a filename, try couple prefix
        (!path.includes('/') && userCoupleId) ? `${userCoupleId}/${path}` : null,
        // If it's a profile/avatar path, try without profiles/ prefix or with current user prefix if missing
        (bucket === 'avatars' && !path.startsWith('profiles/') && currentUserId) ? `profiles/${currentUserId}/${path}` : null,
        // Legacy polaroids fallback
        (bucket === 'memories' && !path.startsWith('polaroids/')) ? `polaroids/${userCoupleId}/${path.split('/').pop()}` : null,
        // Last resort: just the filename
        path.includes('/') ? path.split('/').pop()! : null,
    ];
    const tryPaths = Array.from(new Set(candidates.filter((c): c is string => !!c && c.length > 2))) as string[];

    if (process.env.NODE_ENV === 'development' || !cdnUrl) {
        console.log(`[MediaView] Resolving bucket=${bucket}, path=${path} (User=${currentUserId}, Couple=${userCoupleId})`);
        console.log(`[MediaView] Candidates:`, tryPaths);
    }

    let finalSource = '';
    let finalPath = '';

    // TIER 1: R2 / CDN (Primary)
    if (fetchBaseUrls.length > 0 && tryPaths.length > 0) {
        for (const baseUrl of fetchBaseUrls) {
            const isUploadWorker = baseUrl.includes('upload');
            for (const p of tryPaths) {
                try {
                    const target = isUploadWorker ? `${baseUrl}/${bucket}/${p}` : `${baseUrl}/${p}`;
                    const res = await fetch(target, {
                        headers: isUploadWorker && r2Secret ? {
                            "Authorization": `Bearer ${r2Secret}`,
                            "X-Orbit-R2-Secret": r2Secret
                        } : {},
                        cache: 'no-store'
                    });
                    if (res.ok) {
                        blob = await res.blob();
                        finalSource = 'r2';
                        finalPath = isUploadWorker ? `${bucket}/${p}` : p;

                        // We store the exact target path that succeeded relative to baseUrl so subsequent caches work correctly
                        // The mediaWinnerCache previously expected just the path and prepended the bucket. Let's fix that.
                        break;
                    }
                } catch (e) { }
            }
            if (blob) break;
        }
    }

    // TIER 2: Not used anymore (Supabase removed)

    if (!blob) {
        // Cache this 404 for 5 minutes server-side so we don't spam CF Workers again
        mediaNotFoundCache.set(CACHE_KEY, Date.now() + 5 * 60 * 1000);
        console.warn(`[MediaView] 404 NOT FOUND: bucket=${bucket}, path=${path}. Tried paths:`, tryPaths);
        return new NextResponse(JSON.stringify({ error: "Media not found" }), {
            status: 404,
            headers: {
                "Content-Type": "application/json",
                "Cache-Control": "public, max-age=300, stale-while-revalidate=600"
            }
        });
    }

    mediaWinnerCache.set(CACHE_KEY, {
        source: 'r2',
        winnerPath: finalPath
    });

    return new NextResponse(blob, {
        status: 200,
        headers: {
            "content-type": blob.type || "application/octet-stream",
            "cache-control": "public, max-age=31536000, immutable",
            "x-orbit-media-source": finalSource || "race",
        },
    });
}
