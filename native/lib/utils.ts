export const getPartnerName = (profile: any, partnerProfile: any) => {
    const nickname = profile?.partner_nickname;
    if (typeof nickname === 'string' && nickname.trim()) return nickname.trim();

    const raw =
        partnerProfile?.display_name ||
        partnerProfile?.displayName ||
        partnerProfile?.name ||
        partnerProfile?.nickname ||
        partnerProfile?.first_name ||
        (partnerProfile?.first_name && partnerProfile?.last_name ? `${partnerProfile.first_name} ${partnerProfile.last_name}` : '') ||
        (partnerProfile?.firstName && partnerProfile?.lastName ? `${partnerProfile.firstName} ${partnerProfile.lastName}` : '') ||
        partnerProfile?.full_name ||
        partnerProfile?.username ||
        '';
    if (typeof raw === 'string' && raw.trim()) return raw.trim().split(' ')[0];

    const email = partnerProfile?.email;
    if (typeof email === 'string' && email.includes('@')) {
        return email.split('@')[0];
    }

    return 'Partner';
};

export const getTodayIST = () => {
    // Returns YYYY-MM-DD in IST
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istTime = new Date(now.getTime() + istOffset);
    return istTime.toISOString().split('T')[0];
};

export function getISTDate() {
    // Returns a Date object adjusted to IST time
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    return new Date(now.getTime() + istOffset);
}

export function isDaytime() {
    const now = getISTDate();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const totalMinutes = hours * 60 + minutes;

    const start = 5 * 60; // 5:00 AM
    const end = 18 * 60 + 30; // 6:30 PM

    return totalMinutes >= start && totalMinutes < end;
}

export function getLunarPhase() {
    const now = getISTDate();
    const lp = 2551443;
    const newMoon = new Date('1970-01-07T20:35:00Z').getTime() / 1000;
    const phase = ((now.getTime() / 1000) - newMoon) % lp;
    return phase / lp; // Returns 0.0 to 1.0
}

export function normalizeDate(date: any): Date {
    try {
        if (!date) return new Date();
        if (date instanceof Date) return isNaN(date.getTime()) ? new Date() : date;

        let result: Date;
        if (typeof date === 'number') {
            result = new Date(date);
        } else if (typeof date === 'string') {
            result = new Date(date);
        } else if (date && typeof date === 'object' && 'seconds' in date) {
            // Firestore Timestamp
            result = new Date(date.seconds * 1000 + (date.nanoseconds || 0) / 1000000);
        } else if (date && typeof date === 'object' && typeof date.toMillis === 'function') {
            // Firestore Timestamp instance
            result = new Date(date.toMillis());
        } else {
            result = new Date(date);
        }

        if (isNaN(result.getTime())) {
            console.warn('[normalizeDate] Invalid date input:', date);
            return new Date();
        }
        return result;
    } catch (e) {
        console.warn('[normalizeDate] Error normalizing date:', e, date);
        return new Date();
    }
}

export const parseSafeDate = (dateVal: any): Date | null => {
    const d = normalizeDate(dateVal);
    return isNaN(d.getTime()) ? null : d;
};

export function isLikelyNetworkError(error: any) {
    const message = String(error?.message || error || '').toLowerCase();
    return (
        message.includes('failed to fetch') ||
        message.includes('networkerror') ||
        message.includes('network request failed') ||
        message.includes('load failed') ||
        message.includes('timeout') ||
        message.includes('fetch')
    );
}

export function throttle<T extends (...args: any[]) => any>(func: T, limit: number): (...args: Parameters<T>) => void {
    let inThrottle: boolean;
    let lastArgs: Parameters<T> | null = null;

    return function (this: any, ...args: Parameters<T>) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => {
                inThrottle = false;
                if (lastArgs) {
                    func.apply(this, lastArgs);
                    lastArgs = null;
                }
            }, limit);
        } else {
            lastArgs = args;
        }
    };
}
export function stringToHash(str: string): number {
    let hash = 0;
    if (str.length === 0) return hash;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
}
