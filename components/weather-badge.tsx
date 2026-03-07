'use client'

import { useEffect, useState } from 'react'
import { Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSnow, Sun } from 'lucide-react'
import { fetchWeather } from '@/lib/client/weather'

interface WeatherBadgeProps {
    lat?: number | null;
    lon?: number | null;
    city?: string | null;
}

const WEATHER_CACHE_TTL_MS = 10 * 60 * 1000;

export function WeatherBadge({ lat, lon, city }: WeatherBadgeProps) {
    const [weather, setWeather] = useState<{ temp: number; code: number } | null>(null)
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        if (!lat || !lon) return

        const cacheKey = `orbit:weather:${lat.toFixed(3)}:${lon.toFixed(3)}`;
        let hasFreshCache = false;

        try {
            const raw = localStorage.getItem(cacheKey);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (
                    parsed &&
                    typeof parsed.ts === 'number' &&
                    parsed.data &&
                    Date.now() - parsed.ts < WEATHER_CACHE_TTL_MS
                ) {
                    setWeather(parsed.data);
                    hasFreshCache = true;
                }
            }
        } catch {
            //
        }

        if (hasFreshCache) return;

        const getWeatherData = async () => {
            setLoading(true)
            const data = await fetchWeather(lat, lon)
            if (data) {
                setWeather(data)
                try {
                    localStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data }));
                } catch {
                    //
                }
            }
            setLoading(false)
        }

        getWeatherData()
    }, [lat, lon])

    if (!city && !weather) return null

    const getWeatherIcon = (code: number) => {
        if (code === 0) return <Sun className="w-3 h-3 text-amber-400" />
        if (code <= 3) return <Cloud className="w-3 h-3 text-slate-300" />
        if (code <= 48) return <CloudFog className="w-3 h-3 text-slate-400" />
        if (code <= 57) return <CloudDrizzle className="w-3 h-3 text-blue-300" />
        if (code <= 67) return <CloudRain className="w-3 h-3 text-blue-400" />
        if (code <= 77) return <CloudSnow className="w-3 h-3 text-white" />
        if (code <= 82) return <CloudRain className="w-3 h-3 text-blue-500" />
        if (code <= 99) return <CloudLightning className="w-3 h-3 text-purple-400" />
        return <Sun className="w-3 h-3 text-amber-400" />
    }

    return (
        <div className="flex items-center gap-1.5 px-1 py-0.5 group">
            <span className="text-[10px] md:text-[11px] text-rose-100/60 uppercase tracking-[0.15em] font-bold pl-2 max-w-[120px] md:max-w-[200px] truncate">
                {city || 'Location'}
            </span>
            <span className="text-rose-100/20">•</span>
            <div className="flex items-center gap-1.5 pr-2">
                <div className="opacity-70 scale-90">{weather ? getWeatherIcon(weather.code) : <Cloud className="w-3 h-3 text-slate-400" />}</div>
                <span className="text-[10px] md:text-[11px] font-bold text-rose-100/80 tabular-nums">
                    {weather ? `${weather.temp}°C` : (loading ? '...' : '--')}
                </span>
            </div>
        </div>
    )
}
