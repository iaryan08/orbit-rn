import { StateCreator } from 'zustand';

export const strip = (o: any): string => {
    if (!o) return "";
    try {
        const seen = new Set();
        const clean = (item: any, depth = 0): any => {
            if (!item || typeof item !== 'object' || depth > 4) return item;
            if (seen.has(item)) return "[Circular]";
            seen.add(item);

            if (Array.isArray(item)) {
                return item.map(i => clean(i, depth + 1));
            }

            const {
                updated_at, last_changed, created_at,
                last_synced_at, last_updated, ...rest
            } = item;

            const result: any = {};
            Object.keys(rest).sort().forEach(key => {
                let val = rest[key];
                if (val && typeof val === 'object') {
                    result[key] = clean(val, depth + 1);
                } else if (typeof val === 'string' && (key === 'image_urls' || key === 'read_by' || key === 'location_json')) {
                    try { result[key] = clean(JSON.parse(val), depth + 1); } catch { result[key] = val; }
                } else {
                    result[key] = val;
                }
            });
            return result;
        };

        return JSON.stringify(clean(o));
    } catch { return ""; }
};

export interface AuthSlice {
    profile: any | null;
    partnerProfile: any | null;
    couple: any | null;
    idToken: string | null;
    loading: boolean;
    setProfile: (profile: any) => void;
    setPartnerProfile: (profile: any) => void;
    setCouple: (couple: any) => void;
    resetAuth: () => void;
}

export const createAuthSlice: StateCreator<AuthSlice> = (set) => ({
    profile: null,
    partnerProfile: null,
    couple: null,
    idToken: null,
    loading: false, // Managed by DataSlice

    setProfile: (profile: any) => set({ profile }),
    setPartnerProfile: (partnerProfile: any) => set({ partnerProfile }),
    setCouple: (couple: any) => set({ couple }),
    resetAuth: () => set({ profile: null, partnerProfile: null, couple: null, idToken: null, loading: false }),
});
