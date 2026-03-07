"use client";

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useAppMode } from './app-mode-context';
import { useOrbitStore } from '@/lib/store/global-store';
import { orbitFetch } from '@/lib/client/network';
import { Capacitor } from '@capacitor/core';
import { OutboxSyncManager } from '@/lib/client/outbox';
import { LocalDB } from '@/lib/client/local-db';
import { db, rtdb, auth } from '@/lib/firebase/client';
import { useAuth } from '@/contexts/auth-context';
import {
    doc,
    onSnapshot,
    collection,
    query,
    where,
    orderBy,
    limit,
    Timestamp
} from 'firebase/firestore';
import {
    ref,
    onValue,
    set,
    onDisconnect,
    serverTimestamp as rtdbTimestamp
} from 'firebase/database';

const normalizeFirestoreData = (data: any) => {
    if (!data) return data;
    const next = { ...data };
    Object.keys(next).forEach(key => {
        if (next[key] && typeof next[key] === 'object' && next[key].seconds !== undefined) {
            next[key] = new Date(next[key].seconds * 1000).toISOString();
        }
    });
    return next;
};

export function SyncEngine() {
    const pathname = usePathname();
    const { user } = useAuth();
    const userId = user?.uid;
    const { coupleId } = useAppMode();
    const store = useOrbitStore();
    const lastProcessedRef = useRef<Record<string, number>>({});
    const {
        partnerProfile,
        setCoreData,
        upsertMemory,
        deleteMemory,
        upsertLetter,
        deleteLetter,
        upsertMilestone,
        upsertCycleLog,
        upsertSupportLog,
        upsertBucketItem,
        deleteBucketItem,
        updatePolaroid,
        updateDoodle,
        upsertMood
    } = store;

    // --- MANIFEST SYNC (LAZY TABS) ---
    const syncInFlightRef = useRef<Set<string>>(new Set());
    const lastSyncAtRef = useRef<Record<string, number>>({});

    useEffect(() => {
        if (!coupleId) return;

        const syncTab = async (tab: string, since?: string) => {
            // Rate limit: Don't sync same tab within 30s unless explicitly forced
            const key = `${tab}:${since || 'initial'}`;
            const lastSync = lastSyncAtRef.current[key] || 0;
            if (Date.now() - lastSync < 30000 && !since) return;

            if (syncInFlightRef.current.has(key)) return;
            syncInFlightRef.current.add(key);

            try {
                const url = new URL('/api/sync/tab', window.location.origin);
                url.searchParams.set('tab', tab);
                if (since) url.searchParams.set('since', since);

                const res = await orbitFetch(url.toString());
                if (!res.ok) return;
                const data = await res.json();

                if (tab === 'memories') {
                    if (since) {
                        data.memories?.forEach((m: any) => upsertMemory(m));
                    } else {
                        setCoreData({ memories: data.memories || [] });
                    }
                } else if (tab === 'letters') {
                    if (since) {
                        data.letters?.forEach((l: any) => upsertLetter(l));
                    } else {
                        setCoreData({ letters: data.letters, lettersCount: data.lettersCount || (data.letters?.length || 0) });
                    }
                } else if (tab === 'intimacy') {
                    setCoreData({
                        milestones: data.milestones || {},
                        cycleLogs: data.cycleLogs || [],
                        supportLogs: data.supportLogs || [],
                        userCycle: data.userCycle,
                        partnerCycle: data.partnerCycle
                    });
                }
                lastSyncAtRef.current[key] = Date.now();
            } catch (err) {
                console.error(`[SyncEngine] Tab sync fail (${tab}):`, err);
            } finally {
                syncInFlightRef.current.delete(key);
            }
        };

        let debounceTimer: any;
        const onTabSyncRequest = (e: any) => {
            const { tab, since } = e.detail || {};
            if (!tab) return;

            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                syncTab(tab, since);
            }, 300); // 300ms debounce
        };

        window.addEventListener('orbit:tab-sync', onTabSyncRequest);
        return () => {
            window.removeEventListener('orbit:tab-sync', onTabSyncRequest);
            clearTimeout(debounceTimer);
        };
    }, [coupleId, setCoreData, upsertMemory, upsertLetter]);

    // --- REALTIME: FIREBASE ---
    useEffect(() => {
        if (!coupleId || !userId) return;

        // 1. Presence (RTDB)
        const presenceRef = ref(rtdb, `presence/${coupleId}/${userId}`);
        const userStatusRef = ref(rtdb, `presence/${coupleId}/${userId}/status`);

        onValue(ref(rtdb, '.info/connected'), (snap) => {
            if (snap.val() === false) return;
            onDisconnect(presenceRef).remove().then(() => {
                set(presenceRef, {
                    status: 'online',
                    last_changed: rtdbTimestamp(),
                });
            });
        });

        // Listen to partner presence
        const partnerId = partnerProfile?.id;
        let unsubscribePartnerPresence: any = null;
        if (partnerId) {
            const partnerPresenceRef = ref(rtdb, `presence/${coupleId}/${partnerId}`);
            unsubscribePartnerPresence = onValue(partnerPresenceRef, (snap) => {
                const status = snap.val();
                window.dispatchEvent(new CustomEvent('orbit:presence-sync', {
                    detail: { [partnerId]: [status ? { ...status, user_id: partnerId } : null] }
                }));
            });
        }

        // 2. Ephemeral Broadcasts (RTDB)
        const broadcastRef = ref(rtdb, `broadcasts/${coupleId}`);
        const unsubscribeBroadcasts = onValue(broadcastRef, (snap) => {
            const allData = snap.val();
            if (!allData) return;

            // Iterate through each user's last broadcast
            Object.entries(allData).forEach(([senderId, data]: [string, any]) => {
                if (senderId === userId) return; // Skip self

                const { event, payload, timestamp } = data;
                // Avoid redundant processing
                if (timestamp && timestamp <= (lastProcessedRef.current[senderId] || 0)) return;
                lastProcessedRef.current[senderId] = timestamp;

                // Only process if it's "fresh" (within last 10 seconds)
                const now = Date.now();
                if (timestamp && now - timestamp > 10000) return;

                if (event === 'cinema_event') {
                    window.dispatchEvent(new CustomEvent('orbit:cinema-event', { detail: { ...payload, senderId } }));
                } else if (event === 'doodle_delta') {
                    window.dispatchEvent(new CustomEvent('orbit:doodle-delta', { detail: payload }));
                } else if (event === 'mood_updated') {
                    upsertMood({ ...payload, created_at: new Date().toISOString() });
                } else if (event === 'polaroid_updated') {
                    updatePolaroid(senderId, userId, payload);
                    window.dispatchEvent(new CustomEvent('orbit:polaroid-broadcast', { detail: payload }));
                } else if (event === 'doodle_updated') {
                    updateDoodle(payload);
                } else if (event === 'one_time_vanished') {
                    deleteLetter(payload.letter_id);
                }
            });
        });

        // Global send helper
        (window as any).orbitSend = (event: string, payload: any) => {
            set(ref(rtdb, `broadcasts/${coupleId}/${userId}`), {
                event,
                payload,
                timestamp: Date.now() // Use client time for quick comparison, or serverTimestamp
            });
        };

        // 3. Data Collections (Firestore onSnapshot)
        const unsubscribers: any[] = [];

        // Memories
        unsubscribers.push(onSnapshot(
            query(collection(db, 'couples', coupleId, 'memories'), orderBy('created_at', 'desc'), limit(50)),
            (snap) => {
                snap.docChanges().forEach((change) => {
                    const data = normalizeFirestoreData(change.doc.data());
                    if (change.type === 'removed') deleteMemory(change.doc.id);
                    else upsertMemory({ id: change.doc.id, ...data });
                });
            }
        ));

        // Letters
        unsubscribers.push(onSnapshot(
            query(collection(db, 'couples', coupleId, 'letters'), orderBy('created_at', 'desc'), limit(50)),
            (snap) => {
                snap.docChanges().forEach((change) => {
                    const data = normalizeFirestoreData(change.doc.data());
                    if (change.type === 'removed') deleteLetter(change.doc.id);
                    else upsertLetter({ id: change.doc.id, ...data });
                });
            }
        ));

        // Doodles (Shared Canvas - Full Sync)
        unsubscribers.push(onSnapshot(doc(db, 'couples', coupleId, 'doodles', 'latest'), (snap) => {
            if (snap.exists()) {
                const data = snap.data();
                // Avoid redundant state updates if data is identical
                updateDoodle(data);
                window.dispatchEvent(new CustomEvent('orbit:doodle-full-sync', {
                    detail: data.path_data
                }));
            }
        }, (err) => console.error('[SyncEngine] Doodle snapshot error:', err)));

        // Milestones
        unsubscribers.push(onSnapshot(collection(db, 'couples', coupleId, 'milestones'), (snap) => {
            snap.docs.forEach(d => upsertMilestone({ id: d.id, ...d.data() }));
        }));

        // Cycle Profiles (userCycle / partnerCycle)
        unsubscribers.push(onSnapshot(collection(db, 'couples', coupleId, 'cycle_profiles'), (snap) => {
            snap.docChanges().forEach((change) => {
                if (change.type !== 'removed') {
                    const data = change.doc.data();
                    const cycleUserId = change.doc.id;
                    if (cycleUserId === userId) {
                        setCoreData({ userCycle: { id: cycleUserId, ...data } });
                    } else if (cycleUserId === partnerProfile?.id) {
                        setCoreData({ partnerCycle: { id: cycleUserId, ...data } });
                    }
                }
            });
        }));

        // Cycle/Support Logs
        unsubscribers.push(onSnapshot(collection(db, 'couples', coupleId, 'cycle_logs'), (snap) => {
            snap.docChanges().forEach(c => c.type !== 'removed' && upsertCycleLog({ id: c.doc.id, ...c.doc.data() }));
        }));

        unsubscribers.push(onSnapshot(collection(db, 'couples', coupleId, 'support_logs'), (snap) => {
            snap.docChanges().forEach(c => c.type !== 'removed' && upsertSupportLog({ id: c.doc.id, ...c.doc.data() }));
        }));

        // Moods
        unsubscribers.push(onSnapshot(collection(db, 'couples', coupleId, 'moods'), (snap) => {
            snap.docChanges().forEach(c => {
                if (c.type !== 'removed') {
                    const data = normalizeFirestoreData(c.doc.data());
                    const moodObj = {
                        id: c.doc.id,
                        couple_id: coupleId,
                        ...data,
                        mood: data.emoji,
                        note: data.mood_text
                    };
                    upsertMood(moodObj);
                    if (Capacitor.isNativePlatform()) {
                        LocalDB.upsertFromSync('moods', moodObj).catch(() => { });
                    }
                }
            });
        }));

        unsubscribers.push(onSnapshot(collection(db, 'couples', coupleId, 'polaroids'), (snap) => {
            snap.docChanges().forEach((change) => {
                const data = normalizeFirestoreData(change.doc.data());
                const userIdOfPolaroid = change.doc.id;

                // updatePolaroid(posterId, viewerId, polaroid)
                updatePolaroid(userIdOfPolaroid, userId, { id: userIdOfPolaroid, ...data });

                if (change.type === 'added' || change.type === 'modified') {
                    if (Capacitor.isNativePlatform()) {
                        LocalDB.upsertFromSync('polaroids', { id: userIdOfPolaroid, couple_id: coupleId, ...data, pending_sync: 0 }).catch(() => { });
                    }
                }
            });
        }));

        // 4. Notifications (User-Specific)
        unsubscribers.push(onSnapshot(collection(db, 'users', userId, 'notifications'), (snap) => {
            if (!snap.empty) {
                window.dispatchEvent(new CustomEvent('orbit:notification-refresh'));
                // Trigger audible/haptic feedback if a new unread notif arrived
                const hasNewUnread = snap.docChanges().some(c => c.type === 'added' && !c.doc.data().is_read);
                if (hasNewUnread) {
                    window.dispatchEvent(new CustomEvent('orbit:notifications-sync'));
                }
            }
        }));

        if (Capacitor.isNativePlatform()) OutboxSyncManager.init(coupleId);

        return () => {
            if (unsubscribePartnerPresence) unsubscribePartnerPresence();
            unsubscribeBroadcasts();
            unsubscribers.forEach(u => u());
        };
    }, [coupleId, userId, partnerProfile?.id]);

    // --- UNREAD COUNTS COMPUTATION ---
    useEffect(() => {
        if (!userId || !store.profile) return;

        const profile = store.profile;
        const memories = store.memories || [];
        const letters = store.letters || [];

        const lastViewedMemories = profile.last_viewed_memories_at || new Date(0).toISOString();
        const lastViewedLetters = profile.last_viewed_letters_at || new Date(0).toISOString();

        const unreadMemories = memories.filter((m: any) =>
            m.created_at > lastViewedMemories && m.author_id !== userId
        ).length;

        const unreadLetters = letters.filter((l: any) =>
            l.sender_id !== userId && l.created_at > lastViewedLetters
        ).length;

        if (unreadMemories !== store.unreadMemoriesCount || unreadLetters !== store.unreadLettersCount) {
            setCoreData({
                unreadMemoriesCount: unreadMemories,
                unreadLettersCount: unreadLetters
            });
        }
    }, [store.memories, store.letters, store.profile?.last_viewed_memories_at, store.profile?.last_viewed_letters_at, userId]);

    return null;
}
