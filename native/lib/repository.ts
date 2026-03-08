import { db_local } from './db/db';
import { db as firebaseDb } from './firebase';
import { collection, query, where, getDocs, orderBy, limit, Timestamp } from 'firebase/firestore';
import { memories, letters, moods, bucketList, syncMetadata, polaroids } from './db/schema';
import { eq, sql } from 'drizzle-orm';

class Repository {
    // Generic Delta Sync Engine
    async syncCollection(name: string, coupleId: string, table: any, subPath: string) {
        try {
            // 1. Get last sync time
            const meta = await db_local.select().from(syncMetadata).where(eq(syncMetadata.collection, name)).get();
            const lastSync = meta?.last_synced_at || 0;

            // 2. Fetch only new/updated from Firestore
            const ref = collection(firebaseDb, 'couples', coupleId, subPath);
            const syncField = lastSync === 0 ? 'created_at' : 'updated_at';

            const q = query(
                ref,
                where(syncField, '>', Timestamp.fromMillis(lastSync)),
                orderBy(syncField, 'asc'),
                limit(100)
            );

            const snap = await getDocs(q);
            if (snap.empty) return false;

            // 3. Update local DB (Batch/Upsert)
            let maxUpdatedAt = lastSync;
            for (const doc of snap.docs) {
                const data = doc.data();
                const updatedAt = data.updated_at?.toMillis() || Date.now();
                if (updatedAt > maxUpdatedAt) maxUpdatedAt = updatedAt;

                // Best-in-Class: Deeply sanitize data for SQLite
                const sanitizedData = { ...data };

                // Convert any Firestore Timestamps to numbers
                Object.keys(sanitizedData).forEach(key => {
                    if (sanitizedData[key]?.toMillis) {
                        sanitizedData[key] = sanitizedData[key].toMillis();
                    }
                });

                // Handle specific JSON fields
                if (data.image_urls) sanitizedData.image_urls = JSON.stringify(data.image_urls);
                if (data.read_by) sanitizedData.read_by = JSON.stringify(data.read_by);

                await db_local.insert(table).values({
                    id: doc.id,
                    ...sanitizedData,
                    created_at: data.created_at?.toMillis() || null,
                    updated_at: updatedAt,
                    // Booleans for SQLite
                    is_read: data.is_read ? 1 : 0,
                    is_completed: data.is_completed ? 1 : 0,
                    is_private: data.is_private ? 1 : 0,
                } as any).onConflictDoUpdate({
                    target: table.id,
                    set: {
                        ...sanitizedData,
                        updated_at: updatedAt
                    } as any
                });
            }

            // 4. Update sync metadata
            await db_local.insert(syncMetadata).values({
                collection: name,
                last_synced_at: maxUpdatedAt
            }).onConflictDoUpdate({
                target: syncMetadata.collection,
                set: { last_synced_at: maxUpdatedAt }
            });

            return true; // Changes found
        } catch (e) {
            console.error(`[Repo] Sync error for ${name}:`, e);
            return false;
        }
    }

    async getMemories() {
        const results = await db_local.select().from(memories).orderBy(sql`${memories.created_at} DESC`).all();
        return results.map(row => ({
            ...row,
            image_urls: row.image_urls ? JSON.parse(row.image_urls) : null,
            read_by: row.read_by ? JSON.parse(row.read_by) : null
        }));
    }

    async getLetters() {
        return db_local.select().from(letters).orderBy(sql`${letters.created_at} DESC`).all();
    }

    async getMoods() {
        return db_local.select().from(moods).orderBy(sql`${moods.created_at} DESC`).all();
    }

    async getBucketList() {
        return db_local.select().from(bucketList).orderBy(sql`${bucketList.created_at} DESC`).all();
    }
}

export const repository = new Repository();
