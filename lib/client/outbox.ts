import { LocalDB, SupportedTables } from "./local-db";
import { db, auth } from "@/lib/firebase/client";
import { doc, setDoc, serverTimestamp, collection, addDoc } from "firebase/firestore";
import { Capacitor } from "@capacitor/core";

// Polling intervals for fallback sync
const POLL_INTERVAL = 1000 * 120; // 2 min

class OutboxSyncManager {
    private static isSyncing = false;

    /**
     * Initialize the Outbox worker
     */
    static init(coupleId: string) {
        if (!Capacitor.isNativePlatform()) return;
        console.log('[Outbox] Initializing Firestore-driven sync');
        this.processOutbox(coupleId);
    }

    /**
     * Trigger a sync cycle.
     */
    static trigger(coupleId: string) {
        if (!Capacitor.isNativePlatform()) return;
        this.processOutbox(coupleId).catch(() => { });
    }

    /**
     * Processes pending local changes and pushes them to Firestore
     */
    static async processOutbox(coupleId: string) {
        if (this.isSyncing) return;
        this.isSyncing = true;

        try {
            if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

            const user = auth.currentUser;
            if (!user) return;

            const tablesToSync: SupportedTables[] = [
                'memories', 'love_letters', 'moods', 'milestones', 'cycle_profiles'
            ];

            const collectionMap: Record<string, string> = {
                'memories': 'memories',
                'love_letters': 'letters',
                'moods': 'moods',
                'milestones': 'milestones',
                'cycle_profiles': 'cycle_logs' // Simplification or specific mapping needed? 
            };

            for (const table of tablesToSync) {
                try {
                    const exists = await LocalDB.tableExists(table);
                    if (!exists) continue;

                    const pendingRecords = await LocalDB.getPendingSync<any>(table);
                    if (!pendingRecords || pendingRecords.length === 0) continue;

                    for (const record of pendingRecords) {
                        const targetColl = collectionMap[table];
                        if (!targetColl) continue;

                        // 1. Prepare data for Firestore
                        const { pending_sync, id: dbId, deleted, ...firestoreRecord } = record;

                        // Add metadata
                        const payload = {
                            ...firestoreRecord,
                            updated_at: serverTimestamp()
                        };

                        try {
                            // 2. Push to Firestore
                            if (table === 'cycle_profiles') {
                                // Cycle profiles usually live in user doc or specific log
                                const userRef = doc(db, 'users', record.user_id || user.uid);
                                await setDoc(userRef, { cycle: payload }, { merge: true });
                            } else {
                                const docRef = doc(db, 'couples', coupleId, targetColl, record.id);
                                await setDoc(docRef, payload, { merge: true });
                            }

                            // 3. Mark as synced locally
                            await LocalDB.markSynced(table, record.id || record.user_id || record.couple_id);
                            console.log(`[Outbox] Synced ${table} to Firestore: ${record.id}`);
                        } catch (err) {
                            console.error(`[Outbox] Error pushing ${table} record:`, err);
                        }
                    }
                } catch (tableErr) {
                    console.error(`[Outbox] Error processing table ${table}`, tableErr);
                }
            }
        } catch (e) {
            console.error('[Outbox] Fatal Outbox error', e);
        } finally {
            this.isSyncing = false;
        }
    }

    static triggerImmediateSync(coupleId: string) {
        if (!this.isSyncing) this.processOutbox(coupleId);
    }
}

export { OutboxSyncManager };
