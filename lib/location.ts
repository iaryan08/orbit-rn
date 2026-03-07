// Server-side location resolution
// Uses Nominatim, Photon for reverse geocoding
// Uses TimeAPI.io for timezone resolution
// Uses ipapi.co and ip-api.com for IP-based fallback

const geoCache = new Map<string, { city: string, timezone: string, country: string, expires: number, isIp?: boolean }>();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

export function clearGeoCache() { geoCache.clear(); }

export interface GeoResult {
    city: string;
    timezone: string;
    country: string;
    latitude: number;
    longitude: number;
    isIp?: boolean;
}

/**
 * Resolve city & country from coordinates using parallel geocoding services.
 */
async function reverseGeocodeCoords(lat: number, lng: number): Promise<{ city: string; country: string; timezone?: string }> {
    const userAgent = { 'User-Agent': 'OrbitApp/1.0 (couples-app)' };

    // Define services with their specific parsers
    const services = [
        // 1. Photon (Priority 1 - Fast & Accurate)
        async () => {
            const res = await fetch(
                `https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}&limit=1`,
                { headers: userAgent, signal: AbortSignal.timeout(4000) }
            );
            if (!res.ok) throw new Error('Photon failed');
            const data = await res.json();
            const props = data?.features?.[0]?.properties || {};
            let city = props.city || props.town || props.municipality || props.district || props.county;
            const country = props.country || '';

            // Handle specific regional naming preference
            if (city === 'Manglaur') city = 'Roorkee';

            if (!city) throw new Error('Photon no city');
            return { city, country, source: 'Photon' };
        },
        // 2. Nominatim (Priority 2 - Fallback)
        async () => {
            const res = await fetch(
                `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=11&accept-language=en`,
                { headers: userAgent, signal: AbortSignal.timeout(5000) }
            );
            if (!res.ok) throw new Error('Nominatim failed');
            const data = await res.json();
            const addr = data.address || {};
            let city = addr.city || addr.town || addr.municipality || addr.village || addr.suburb;
            const country = addr.country || '';

            // Handle specific regional naming preference
            if (city === 'Manglaur') city = 'Roorkee';

            if (!city) throw new Error('Nominatim no city');
            return { city, country, source: 'Nominatim' };
        }
    ];

    try {
        // Run remaining in parallel, take the first one that succeeds
        const result = await Promise.any(services.map(s => s()));
        console.log(`[Location] ${result.source} resolved: ${result.city}`);
        return result;
    } catch (err) {
        console.error('[Location] All geocoding services failed');
        return { city: '', country: '' };
    }
}

/**
 * Resolve timezone from coordinates.
 */
async function resolveTimezoneFromCoords(lat: number, lng: number): Promise<string> {
    try {
        const res = await fetch(
            `https://timeapi.io/api/timezone/coordinate?latitude=${lat}&longitude=${lng}`,
            { signal: AbortSignal.timeout(3000) }
        );
        if (res.ok) {
            const data = await res.json();
            if (data.timeZone) return data.timeZone;
        }
    } catch (err) {
        console.warn('[Location] Timezone resolution failed');
    }
    return 'UTC';
}

/**
 * Main entry point for location resolution.
 */
export async function resolveLocation(
    lat?: number | null,
    lng?: number | null,
    ip?: string | null,
    vercelGeo?: { city?: string, country?: string, latitude?: string, longitude?: string },
    skipCache?: boolean,
    clientTimezone?: string
): Promise<GeoResult | null> {
    let finalLat = lat;
    let finalLng = lng;
    let isIp = false;

    // 1. Determine Coordinates (GPS or IP Fallback)
    if (finalLat == null || finalLng == null) {
        isIp = true;

        // 1a. Vercel Header (Highest priority for server-side IP)
        if (vercelGeo?.latitude && vercelGeo?.longitude) {
            finalLat = parseFloat(vercelGeo.latitude);
            finalLng = parseFloat(vercelGeo.longitude);
        } else {
            // 1b. Real IP Lookup (for localhost/VPN)
            let targetIp = ip;
            const isLocal = !targetIp || targetIp === '::1' || targetIp === '127.0.0.1' || targetIp.startsWith('192.168.') || targetIp.startsWith('10.');

            if (isLocal) {
                try {
                    const res = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(2500) });
                    if (res.ok) targetIp = (await res.json()).ip;
                } catch { }
            }

            // 1c. IP Geolocation Fallback
            if (targetIp) {
                try {
                    const ipGeo = await Promise.any([
                        (async () => {
                            const res = await fetch(`https://ipapi.co/${targetIp}/json/`, { signal: AbortSignal.timeout(3500) });
                            if (!res.ok) throw new Error();
                            const data = await res.json();
                            if (!data.latitude || !data.city) throw new Error();
                            return {
                                city: data.city,
                                timezone: data.timezone,
                                country: data.country_name || '',
                                latitude: data.latitude,
                                longitude: data.longitude
                            };
                        })(),
                        (async () => {
                            const res = await fetch(`http://ip-api.com/json/${targetIp}?fields=status,country,city,lat,lon,timezone`, { signal: AbortSignal.timeout(3000) });
                            if (!res.ok) throw new Error();
                            const data = await res.json();
                            if (data.status !== 'success' || !data.lat) throw new Error();
                            return {
                                city: data.city,
                                timezone: data.timezone,
                                country: data.country || '',
                                latitude: data.lat,
                                longitude: data.lon
                            };
                        })()
                    ]);

                    if (ipGeo) {
                        finalLat = ipGeo.latitude;
                        finalLng = ipGeo.longitude;
                        return {
                            city: ipGeo.city,
                            timezone: ipGeo.timezone,
                            country: ipGeo.country,
                            latitude: ipGeo.latitude,
                            longitude: ipGeo.longitude,
                            isIp: true
                        };
                    }
                } catch (err) {
                    // Only warn if it's not a local IP (which we expect to fail)
                    if (!isLocal) console.warn('[Location] IP Geolocation racing failed');
                }
            }
        }
    }

    // Default local fallback for development if all else fails
    if ((finalLat == null || finalLng == null) && (ip === '::1' || ip === '127.0.0.1' || !ip)) {
        return {
            city: 'Development',
            timezone: clientTimezone || 'Asia/Kolkata',
            country: 'Local',
            latitude: 28.6139,
            longitude: 77.2090,
            isIp: true
        };
    }

    if (finalLat == null || finalLng == null) return null;

    // 2. Cache Check
    const cacheKey = `${Math.round(finalLat * 100) / 100},${Math.round(finalLng * 100) / 100}`;
    const cached = geoCache.get(cacheKey);
    if (!skipCache && cached && cached.expires > Date.now()) {
        return { ...cached, latitude: finalLat, longitude: finalLng };
    }

    // 3. Resolve Data
    // We can confidently skip the slow TimeAPI timezone check if the client provided it via JS Intl!
    const [geo, tz] = await Promise.all([
        reverseGeocodeCoords(finalLat, finalLng),
        clientTimezone ? Promise.resolve(clientTimezone) : resolveTimezoneFromCoords(finalLat, finalLng)
    ]);

    const result: GeoResult = {
        city: geo.city || 'Unknown',
        timezone: geo.timezone || tz,
        country: geo.country || 'Unknown',
        latitude: finalLat,
        longitude: finalLng,
        isIp
    };

    // 4. Update Cache
    if (result.city !== 'Unknown') {
        geoCache.set(cacheKey, {
            city: result.city,
            timezone: result.timezone,
            country: result.country,
            expires: Date.now() + CACHE_TTL,
            isIp
        });
    }

    return result;
}