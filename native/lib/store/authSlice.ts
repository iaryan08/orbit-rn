import { StateCreator } from 'zustand';

export interface AuthSlice {
    profile: any | null;
    partnerProfile: any | null;
    couple: any | null;
    idToken: string | null;
    loading: boolean;
    setProfile: (profile: any) => void;
    setPartnerProfile: (profile: any) => void;
    setCouple: (couple: any) => void;
}

export const createAuthSlice: StateCreator<AuthSlice> = (set) => ({
    profile: null,
    partnerProfile: null,
    couple: null,
    idToken: null,
    loading: true,

    setProfile: (profile: any) => set({ profile }),
    setPartnerProfile: (partnerProfile: any) => set({ partnerProfile }),
    setCouple: (couple: any) => set({ couple }),
});
