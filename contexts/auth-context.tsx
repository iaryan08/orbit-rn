'use client'

import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase/client';
import { useOrbitStore } from '@/lib/store/global-store';

interface AuthContextType {
    user: User | null;
    loading: boolean;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    loading: true,
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const setCoreData = useOrbitStore((state) => state.setCoreData);
    const setInitialized = useOrbitStore((state) => state.setInitialized);

    useEffect(() => {
        let unsubscribeProfile: (() => void) | null = null;
        let unsubscribeCouple: (() => void) | null = null;
        let unsubscribePartner: (() => void) | null = null;

        const cleanupListeners = () => {
            if (unsubscribeProfile) unsubscribeProfile();
            if (unsubscribeCouple) unsubscribeCouple();
            if (unsubscribePartner) unsubscribePartner();
            unsubscribeProfile = null;
            unsubscribeCouple = null;
            unsubscribePartner = null;
        };

        const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
            setUser(firebaseUser);

            if (firebaseUser) {
                // Cache token for synchronous access (e.g. media decryption)
                try {
                    const token = await firebaseUser.getIdToken();
                    localStorage.setItem('orbit_active_session', token);
                } catch (err) {
                    console.warn('[AuthContext] Token caching failed:', err);
                }
            } else {
                localStorage.removeItem('orbit_active_session');
            }

            // EMERGENCY BOOT: If snapshots hang for more than 4s, force initialize
            const bootTimeout = setTimeout(() => {
                console.warn('[AuthContext] Emergency boot triggered');
                setInitialized(true);
                setLoading(false);
            }, 4000);

            if (firebaseUser) {
                // 1. Listen to user profile
                unsubscribeProfile = onSnapshot(doc(db, 'users', firebaseUser.uid), (userSnap) => {
                    if (userSnap.exists()) {
                        const userData = userSnap.data();
                        setCoreData({ profile: { id: firebaseUser.uid, ...userData } });

                        if (userData.couple_id) {
                            const coupleId = userData.couple_id;

                            // 2. Listen to couple metadata
                            if (!unsubscribeCouple) {
                                unsubscribeCouple = onSnapshot(doc(db, 'couples', coupleId), (coupleSnap) => {
                                    if (coupleSnap.exists()) {
                                        const coupleData = coupleSnap.data() as any;
                                        setCoreData({ couple: { id: coupleId, ...coupleData } });

                                        // 3. Listen to partner profile
                                        const partnerId = coupleData.user1_id === firebaseUser.uid ? coupleData.user2_id : coupleData.user1_id;
                                        if (partnerId && !unsubscribePartner) {
                                            unsubscribePartner = onSnapshot(doc(db, 'users', partnerId), (partnerSnap) => {
                                                if (partnerSnap.exists()) {
                                                    setCoreData({ partnerProfile: { id: partnerId, ...partnerSnap.data() } });
                                                }
                                            }, (err) => console.error('[AuthContext] Partner Profile Error:', err));
                                        }

                                        clearTimeout(bootTimeout);
                                        setInitialized(true);
                                        setLoading(false);
                                    }
                                }, (err) => {
                                    console.error('[AuthContext] Couple Snapshot Error:', err);
                                    clearTimeout(bootTimeout);
                                    setInitialized(true); // Proceed even on error to allow PairingWall or error state
                                    setLoading(false);
                                });
                            }
                        } else {
                            clearTimeout(bootTimeout);
                            setInitialized(true);
                            setLoading(false);
                        }
                    } else {
                        clearTimeout(bootTimeout);
                        setCoreData({ profile: null, couple: null, partnerProfile: null });
                        setInitialized(true);
                        setLoading(false);
                    }
                }, (err) => {
                    if (err.code !== 'permission-denied') console.error('[AuthContext] Profile Snapshot Error:', err);
                    // Don't setInitialized here, wait for bootTimeout or successful snapshot
                });
            } else {
                cleanupListeners();
                clearTimeout(bootTimeout);
                setCoreData({ profile: null, couple: null, partnerProfile: null });
                setInitialized(true);
                setLoading(false);
            }
        });

        return () => {
            unsubscribeAuth();
            cleanupListeners();
        };
    }, [setCoreData, setInitialized]);

    return (
        <AuthContext.Provider value={{ user, loading }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
