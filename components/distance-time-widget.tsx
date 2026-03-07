'use client'

import { useState, useEffect } from 'react'
import { MapPin, Clock, Navigation, Globe, Wifi } from 'lucide-react'
import { updateLocation } from '@/lib/client/auth'
import { cn } from '@/lib/utils'

/**
 * Gets the most accurate GPS position available.
 * On Android APK: uses @capacitor/geolocation (native hardware GPS, ~50-200ms)
 * On Web: falls back to browser navigator.geolocation
 */
async function getNativePosition(): Promise<{ latitude: number; longitude: number } | null> {
    try {
        const { Geolocation } = await import('@capacitor/geolocation')
        const pos = await Geolocation.getCurrentPosition({
            timeout: 10000,
            enableHighAccuracy: true
        })
        return { latitude: pos.coords.latitude, longitude: pos.coords.longitude }
    } catch {
        return new Promise((resolve) => {
            if (!navigator?.geolocation) return resolve(null)
            navigator.geolocation.getCurrentPosition(
                (p) => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude }),
                () => resolve(null),
                { enableHighAccuracy: true, timeout: 4000, maximumAge: 30000 }
            )
        })
    }
}

const LOCATION_CACHE_KEY = 'orbit:last_resolved_location'
const LOCATION_SYNC_ATTEMPT_KEY = 'orbit:last_location_sync_attempt_at'
const LOCATION_SYNC_TTL_MS = 6 * 60 * 60 * 1000 // 6h

interface DistanceWidgetProps {
    uProfile: any;
    partnerProfile: any;
}

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 6371; // Radius of the earth in km
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const straightLine = R * c; // Distance in km

    // Applying the 1.25 road factor for accurate travel distance estimation.
    return straightLine * 1.25;
}

function deg2rad(deg: number) {
    return deg * (Math.PI / 180);
}

function formatRelativeTime(dateString: string | null, now: Date) {
    if (!dateString) return null;
    try {
        const date = new Date(dateString);
        const diffInMs = now.getTime() - date.getTime();
        const diffInSeconds = Math.floor(diffInMs / 1000);

        if (diffInSeconds < 30) return 'just now';
        const diffInMinutes = Math.floor(diffInSeconds / 60);
        if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
        const diffInHours = Math.floor(diffInMinutes / 60);
        if (diffInHours < 24) return `${diffInHours}h ago`;
        const diffInDays = Math.floor(diffInHours / 24);
        return `${diffInDays}d ago`;
    } catch (e) {
        return null;
    }
}

export function DistanceTimeWidget({ uProfile, partnerProfile }: DistanceWidgetProps) {
    const [updating, setUpdating] = useState(false)
    const [currentTime, setCurrentTime] = useState(new Date())
    const [isBlocked, setIsBlocked] = useState(false)
    const [userOverride, setUserOverride] = useState<any>(null)

    useEffect(() => {
        let timeout: number | null = null
        const tick = () => {
            if (!document.hidden) setCurrentTime(new Date())
            const now = Date.now()
            const msToNextMinute = 60000 - (now % 60000)
            timeout = window.setTimeout(tick, Math.max(1000, msToNextMinute))
        }
        tick()
        return () => {
            if (timeout) window.clearTimeout(timeout)
        }
    }, [])

    useEffect(() => {
        if (typeof window === 'undefined') return
        let cancelled = false

        try {
            const cached = localStorage.getItem(LOCATION_CACHE_KEY)
            if (cached) {
                const parsed = JSON.parse(cached)
                if (parsed && !cancelled) setUserOverride(parsed)
            }
        } catch { }

        const run = async () => {
            if (cancelled) return
            const now = Date.now()
            const lastSyncTs = Number(localStorage.getItem(LOCATION_SYNC_ATTEMPT_KEY) || '0')
            if (lastSyncTs > 0 && now - lastSyncTs < LOCATION_SYNC_TTL_MS) {
                return
            }
            localStorage.setItem(LOCATION_SYNC_ATTEMPT_KEY, String(now))
            try {
                // Try Capacitor native GPS first (Android APK path)
                const { Geolocation } = await import('@capacitor/geolocation')
                const perm = await Geolocation.checkPermissions()
                if (cancelled) return

                if (perm.location === 'granted' || perm.coarseLocation === 'granted') {
                    await handleUpdateLocation()
                } else if (perm.location === 'prompt' || perm.location === 'prompt-with-rationale') {
                    const req = await Geolocation.requestPermissions()
                    if (req.location === 'granted' || req.coarseLocation === 'granted') {
                        await handleUpdateLocation()
                    } else {
                        const ipResult = await updateLocation({})
                        if ((ipResult as any)?.success) {
                            setUserOverride((prev: any) => ({
                                ...(prev || {}),
                                ...(ipResult as any),
                                updated_at: (ipResult as any).updated_at || new Date().toISOString()
                            }))
                        }
                    }
                } else {
                    // Denied — IP fallback
                    const ipResult = await updateLocation({})
                    if ((ipResult as any)?.success) {
                        setUserOverride((prev: any) => ({
                            ...(prev || {}),
                            ...(ipResult as any),
                            updated_at: (ipResult as any).updated_at || new Date().toISOString()
                        }))
                    }
                }
            } catch {
                // Web browser context — check via navigator.permissions
                if (navigator.permissions && navigator.geolocation) {
                    try {
                        const result = await navigator.permissions.query({ name: 'geolocation' as PermissionName })
                        if (cancelled) return
                        if (result.state === 'granted') {
                            await handleUpdateLocation()
                        } else {
                            const ipResult = await updateLocation({})
                            if ((ipResult as any)?.success) {
                                setUserOverride((prev: any) => ({
                                    ...(prev || {}),
                                    ...(ipResult as any),
                                    updated_at: (ipResult as any).updated_at || new Date().toISOString()
                                }))
                            }
                        }
                    } catch {
                        if (!cancelled) {
                            const ipResult = await updateLocation({})
                            if ((ipResult as any)?.success) {
                                setUserOverride((prev: any) => ({
                                    ...(prev || {}),
                                    ...(ipResult as any),
                                    updated_at: (ipResult as any).updated_at || new Date().toISOString()
                                }))
                            }
                        }
                    }
                } else {
                    const ipResult = await updateLocation({})
                    if ((ipResult as any)?.success) {
                        setUserOverride((prev: any) => ({
                            ...(prev || {}),
                            ...(ipResult as any),
                            updated_at: (ipResult as any).updated_at || new Date().toISOString()
                        }))
                    }
                }
            }
        }

        run()

        return () => { cancelled = true }
    }, [])

    const handleUpdateLocation = async () => {
        setUpdating(true)
        if (typeof window !== 'undefined') {
            localStorage.setItem(LOCATION_SYNC_ATTEMPT_KEY, String(Date.now()))
        }
        try {
            const coords = await getNativePosition()
            if (coords) {
                const result = await updateLocation(coords)
                const next = {
                    latitude: (result as any)?.latitude ?? coords.latitude,
                    longitude: (result as any)?.longitude ?? coords.longitude,
                    city: (result as any)?.city,
                    timezone: (result as any)?.timezone,
                    location_source: (result as any)?.location_source || 'gps',
                    updated_at: (result as any)?.updated_at || new Date().toISOString()
                }
                setUserOverride((prev: any) => ({ ...(prev || {}), ...next }))
                if (typeof window !== 'undefined') {
                    localStorage.setItem(LOCATION_CACHE_KEY, JSON.stringify(next))
                }
                setIsBlocked(false)
            } else {
                // No GPS — fall back to IP-based location
                const ipResult = await updateLocation({})
                if ((ipResult as any)?.success) {
                    const next = {
                        latitude: (ipResult as any)?.latitude,
                        longitude: (ipResult as any)?.longitude,
                        city: (ipResult as any)?.city,
                        timezone: (ipResult as any)?.timezone,
                        location_source: (ipResult as any)?.location_source || 'ip',
                        updated_at: (ipResult as any)?.updated_at || new Date().toISOString()
                    }
                    setUserOverride((prev: any) => ({ ...(prev || {}), ...next }))
                    if (typeof window !== 'undefined') {
                        localStorage.setItem(LOCATION_CACHE_KEY, JSON.stringify(next))
                    }
                    setIsBlocked(false)
                } else {
                    const cached = typeof window !== 'undefined' ? localStorage.getItem(LOCATION_CACHE_KEY) : null
                    if (cached) {
                        try {
                            setUserOverride(JSON.parse(cached))
                        } catch { }
                    }
                    setIsBlocked(true)
                }
            }
        } catch {
            const cached = typeof window !== 'undefined' ? localStorage.getItem(LOCATION_CACHE_KEY) : null
            if (cached) {
                try {
                    setUserOverride(JSON.parse(cached))
                } catch { }
            }
        } finally {
            setUpdating(false)
        }
    }

    const userProfile = { ...(uProfile || {}), ...(userOverride || {}) }

    const formatTime = (timezone: string) => {
        try {
            return new Date().toLocaleTimeString('en-US', {
                timeZone: timezone,
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
            })
        } catch (e) {
            return '--:--'
        }
    }

    const hasUserLoc = (userProfile?.latitude !== undefined && userProfile?.latitude !== null) &&
        (userProfile?.longitude !== undefined && userProfile?.longitude !== null)
    const hasPartnerLoc = (partnerProfile?.latitude !== undefined && partnerProfile?.latitude !== null) &&
        (partnerProfile?.longitude !== undefined && partnerProfile?.longitude !== null)

    const distance = (hasUserLoc && hasPartnerLoc)
        ? calculateDistance(userProfile.latitude, userProfile.longitude, partnerProfile.latitude, partnerProfile.longitude).toFixed(0)
        : null

    const isEstimated = userProfile?.location_source === 'ip' || partnerProfile?.location_source === 'ip'
    const areClose = distance && parseInt(distance) < 5

    return (
        <div className="glass-card connection-card-shell p-4 relative overflow-visible group h-full flex flex-col justify-between rounded-2xl">
            <div className="absolute inset-0 pointer-events-none overflow-visible">
                <div className="absolute -right-14 -top-24 text-white/[0.1] transform -rotate-12 transition-transform duration-700 group-hover:rotate-0">
                    <Globe className="w-64 h-64" strokeWidth={0.55} />
                </div>
            </div>

            <div className="relative z-10 flex flex-col h-full">
                <div className="flex items-center justify-between mb-3">
                    <h3 className="text-white/60 font-serif font-medium flex items-center gap-2 text-xs italic">
                        <Navigation className="w-3 h-3 text-rose-300" />
                        Location
                    </h3>
                    <div className="flex items-center gap-2">
                        {updating ? (
                            <div className="flex items-center gap-2">
                                <div className="w-1 h-1 rounded-full bg-rose-400 animate-pulse" />
                                <span className="text-[10px] text-rose-300/40 font-bold uppercase tracking-widest">Syncing</span>
                            </div>
                        ) : (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation()
                                    handleUpdateLocation()
                                }}
                                className="p-1 rounded-full hover:bg-white/5 text-white/20 hover:text-rose-300/60 transition-colors"
                            >
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    width="12"
                                    height="12"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="3"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    className={cn(updating && "animate-spin")}
                                >
                                    <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
                                    <path d="M21 3v5h-5" />
                                </svg>
                            </button>
                        )}
                    </div>
                </div>

                <div className="flex-1 flex flex-col justify-center">
                    <div className="flex items-start justify-between w-full">
                        <div className="text-left relative z-10 w-[35%] flex flex-col">
                            <div className="text-lg font-bold text-white leading-none">
                                {formatTime(userProfile?.timezone || 'UTC')}
                            </div>
                            <div className="text-[10px] text-white/40 font-medium mt-0.5 flex flex-col gap-0.5">
                                <div className="flex items-center justify-start gap-1 w-full text-[10px]">
                                    <span className="leading-tight truncate max-w-full">
                                        {userProfile?.city || (areClose && partnerProfile?.city) || (userProfile?.display_name || 'Me')}
                                    </span>
                                    {userProfile?.location_source === 'ip' && <span className="text-[8px] text-rose-400 font-bold shrink-0">(IP)</span>}
                                </div>
                                {hasUserLoc && (
                                    <span className="text-[8px] text-emerald-400/60 tracking-tight truncate max-w-full font-medium">
                                        · {formatRelativeTime(userProfile.updated_at, currentTime)}
                                    </span>
                                )}
                            </div>
                        </div>

                        <div className="w-[30%] flex flex-col items-center justify-center relative h-full min-h-[40px] px-1">
                            {hasUserLoc && hasPartnerLoc ? (
                                areClose ? (
                                    <span className="text-xs font-bold text-emerald-400 bg-emerald-400/10 px-3 py-1 rounded-full border border-emerald-400/20 animate-pulse text-center">
                                        Together
                                    </span>
                                ) : (
                                    <>
                                        <div className="w-full h-px bg-indigo-500/20 relative w-full">
                                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-indigo-500/50 to-transparent w-full h-full" />
                                        </div>
                                        <span className="text-[11px] md:text-xs font-bold text-indigo-200 bg-indigo-950/40 px-2 md:px-4 py-0.5 rounded-full -mt-2.5 z-10 border border-indigo-500/30 whitespace-nowrap">
                                            {distance} km
                                        </span>
                                    </>
                                )
                            ) : (
                                <span className="text-[10px] text-white/20 italic text-center max-w-full leading-tight">
                                    {!hasUserLoc ? "Update location" : "Waiting"}
                                </span>
                            )}
                        </div>

                        <div className="w-[35%] text-right flex flex-col items-end">
                            <div className="text-lg font-bold text-white/90 leading-none">
                                {partnerProfile?.timezone ? formatTime(partnerProfile.timezone) : '--:--'}
                            </div>
                            <div className="text-[10px] text-white/40 font-medium mt-0.5 flex flex-col items-end gap-0.5 w-full text-right">
                                <div className="flex items-center justify-end gap-1 w-full text-right max-w-full">
                                    {partnerProfile?.location_source === 'ip' && <span className="text-[8px] text-rose-400 font-bold shrink-0">(IP)</span>}
                                    <span className="leading-tight truncate text-right text-[10px]">{partnerProfile?.city || (partnerProfile?.display_name || 'Partner')}</span>
                                </div>
                                {hasPartnerLoc && (
                                    <span className="text-[8px] text-emerald-400/60 tracking-tight truncate max-w-full font-medium text-right">
                                        {formatRelativeTime(partnerProfile.updated_at, currentTime)}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Estimated badge hint */}
                {isEstimated && (
                    <div className="relative flex items-center gap-2 mt-2 border-t border-white/5 pt-2">
                        <Wifi className="w-2.5 h-2.5 text-rose-400/35 shrink-0" />
                        <span className="text-[9px] text-white/30 leading-tight italic">
                            Distance estimated via IP (may be inaccurate)
                        </span>
                    </div>
                )}
            </div>
        </div>
    )
}
