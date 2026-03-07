import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))

}

export function getTodayIST() {
  // Returns YYYY-MM-DD in IST
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

export function getISTDate() {
  // Returns a Date object adjusted to IST time
  const now = new Date()
  return new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }))
}

export function isDaytime() {
  const now = getISTDate()
  const hours = now.getHours()
  const minutes = now.getMinutes()
  const totalMinutes = hours * 60 + minutes

  const start = 5 * 60; // 5:00 AM
  const end = 18 * 60 + 30; // 6:30 PM

  return totalMinutes >= start && totalMinutes < end
}

export function getAtmosphereTheme() {
  const isDay = isDaytime()

  if (isDay) {
    return {
      overlay: 'linear-gradient(135deg, rgba(255, 182, 193, 0.25) 0%, rgba(20, 16, 15, 0.55) 100%)', // Soft Rose Day
      accent: 'rose-400',
      orb1: 'rgba(251, 113, 133, 0.2)', // Rose
      orb2: 'rgba(251, 191, 36, 0.15)',   // Amber
      mode: 'day' as const
    }
  }

  return {
    overlay: 'linear-gradient(135deg, rgba(20, 16, 15, 0.45) 0%, rgba(45, 25, 42, 0.65) 100%)', // Deep Night
    accent: 'purple-400',
    orb1: 'rgba(168, 85, 247, 0.2)',  // Purple
    orb2: 'rgba(219, 39, 119, 0.15)',   // Pinkish Purple
    mode: 'night' as const
  }
}
export function getLunarPhase() {
  const now = getISTDate()
  const lp = 2551443;
  const newMoon = new Date('1970-01-07T20:35:00Z').getTime() / 1000;
  const phase = ((now.getTime() / 1000) - newMoon) % lp;
  return phase / lp; // Returns 0.0 to 1.0
}

/**
 * Rewrites a Supabase Storage URL to use the Cloudflare R2 Gateway if configured.
 * This enables zero-cost egress and edge caching.
 */
export function getProxiedImageUrl(url: string | null | undefined) {
  if (!url) return '';
  if (url.startsWith('data:') || url.startsWith('blob:')) return url;

  const cdnUrl = process.env.NEXT_PUBLIC_CDN_URL;
  if (!cdnUrl) return url;

  // If the URL contains 'storage/v1/object/public/', extract the path after it
  // and append it to our R2 Gateway URL.
  const supabaseMarker = 'storage/v1/object/public/';
  if (url.includes(supabaseMarker)) {
    const parts = url.split(supabaseMarker);
    const path = parts[1];
    // Remove the bucket name (e.g. 'memories/') if the R2 worker handles it
    // Our provided r2-gateway/worker.js expects the remaining path.
    return `${cdnUrl.replace(/\/$/, '')}/${path}`;
  }

  return url;
}

export function normalizeDate(date: any): Date {
  if (!date) return new Date();
  if (date instanceof Date) return date;
  if (typeof date === 'number') return new Date(date);
  if (typeof date === 'string') return new Date(date);
  if (date && typeof date === 'object' && 'seconds' in date) {
    return new Date(date.seconds * 1000 + (date.nanoseconds || 0) / 1000000);
  }
  return new Date(date);
}
