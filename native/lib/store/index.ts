import { create } from 'zustand';
import { createAppSlice, AppSlice } from './appSlice';
import { createAuthSlice, AuthSlice } from './authSlice';
import { createDataSlice, DataSlice } from './dataSlice';
import { createLunaraSlice, LunaraSlice } from './lunaraSlice';

export type { AppSlice } from './appSlice';
export type OrbitState = AppSlice & AuthSlice & DataSlice & LunaraSlice & { logout: () => void };

export const useOrbitStore = create<OrbitState>()((...a) => ({
    ...createAppSlice(...a),
    ...createAuthSlice(...a),
    ...createDataSlice(...a),
    ...createLunaraSlice(...a),
    logout: () => {
        const [set, get] = a;
        set({
            profile: null,
            partnerProfile: null,
            couple: null,
            idToken: null,
        });
        get().resetData?.();
    }
}));
