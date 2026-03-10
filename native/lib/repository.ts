import { db_local } from './db/db';
import { db as firebaseDb } from './firebase';
import { collection, query, where, getDocs, orderBy, limit, Timestamp } from 'firebase/firestore';
import { memories, letters, moods, bucketList, syncMetadata, polaroids, musicState, profiles, couples } from './db/schema';
import { eq, sql } from 'drizzle-orm';

class Repository {
    // Profiling & Personalization Caching
    async getProfiles() {
        return db_local.select().from(profiles).all();
    }

    async getCouple(id: string) {
        return db_local.select().from(couples).where(eq(couples.id, id)).get();
    }

    async saveCouple(id: string, data: any) {
        const payload = {
            id,
            user1_id: data.user1_id || null,
            user2_id: data.user2_id || null,
            anniversary_date: data.anniversary_date || null,
            paired_at: data.paired_at || null,
            wallpaper_url: data.wallpaper_url || null,
            updated_at: Date.now(),
        };
        try {
            await db_local.insert(couples).values(payload as any).onConflictDoUpdate({
                target: couples.id,
                set: payload as any
            });
        } catch (e) {
            console.warn("[Repo] saveCouple failed:", e);
        }
    }

    async saveProfile(id: string, data: any, isPartner = false) {
        const payload = {
            id,
            display_name: data.display_name || null,
            avatar_url: data.avatar_url || null,
            couple_id: data.couple_id || null,
            partner_id: data.partner_id || null,
            partner_nickname: data.partner_nickname || null,
            custom_wallpaper_url: data.custom_wallpaper_url || (data.wallpaper_url) || null,
            background_aesthetic: data.background_aesthetic || null,
            bio: data.bio || null,
            location_city: data.location_city || (data.location?.city) || null,
            location_json: data.location ? JSON.stringify(data.location) : (data.location_json || null),
            is_partner: isPartner ? 1 : 0,
            updated_at: Date.now(),
            // Add any other profile fields here if they are not already present
            // For example, if there's a 'status' field:
            // status: data.status || null,
            // If there's a 'preferences' field that needs JSON stringification:
            // preferences: data.preferences ? JSON.stringify(data.preferences) : null,
        };
        try {
            await db_local.insert(profiles).values(payload as any).onConflictDoUpdate({
                target: profiles.id,
                set: payload as any
            });
        } catch (e) {
            console.warn("[Repo] saveProfile failed:", e);
        }
    }

    // Generic Delta Sync Engine
    async syncCollection(name: string, coupleId: string, table: any, subPath: string) {
        try {
            // 1. Get last sync time
            const meta = await db_local.select().from(syncMetadata).where(eq(syncMetadata.collection, name)).get();
            const lastSync = meta?.last_synced_at || 0;

            // 2. Fetch only new/updated from Firestore
            const ref = collection(firebaseDb, 'couples', coupleId, subPath);

            // Standardize on updated_at for pure delta sync.
            // If lastSync is 0, we pull the 50 most recent items to avoid a massive 10MBPS blast.
            const deltaField = name === 'polaroids' ? 'created_at' : 'updated_at';
            const q = query(
                ref,
                where(deltaField, '>', Timestamp.fromMillis(lastSync)),
                orderBy(deltaField, 'asc'),
                limit(lastSync === 0 ? 50 : 100)
            );

            const snap = await getDocs(q);
            if (snap.empty) return false;

            // 3. Update local DB (Batch/Upsert)
            let maxUpdatedAt = lastSync;
            for (const doc of snap.docs) {
                const data = doc.data();
                const updatedAt =
                    data.updated_at?.toMillis?.() ||
                    data.created_at?.toMillis?.() ||
                    Date.now();
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
                if (name === 'bucket_list') {
                    const normalizedTitle = typeof data.title === 'string' ? data.title.trim() : '';
                    if (!normalizedTitle) {
                        console.warn(`[Repo] Skipping invalid bucket_list row with empty title: ${doc.id}`);
                        continue;
                    }
                    sanitizedData.title = normalizedTitle;
                }

                if (name === 'polaroids') {
                    sanitizedData.polaroid_date = data.polaroid_date || null;
                }

                await db_local.insert(table).values({
                    id: doc.id,
                    ...sanitizedData,
                    created_at: data.created_at?.toMillis() || null,
                    updated_at: updatedAt,
                    // Booleans for SQLite
                    is_read: data.is_read ? 1 : 0,
                    is_scheduled: data.is_scheduled ? 1 : 0,
                    is_vanish: data.is_vanish ? 1 : 0,
                    is_completed: data.is_completed ? 1 : 0,
                    is_private: data.is_private ? 1 : 0,
                    deleted: data.deleted ? 1 : 0,
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
        const results = await db_local.select().from(memories).where(sql`${memories.deleted} IS NOT 1`).orderBy(sql`${memories.created_at} DESC`).all();
        return results.map(row => ({
            ...row,
            image_urls: row.image_urls ? JSON.parse(row.image_urls) : null,
            read_by: row.read_by ? JSON.parse(row.read_by) : null
        }));
    }

    async getLetters() {
        const rows = await db_local.select().from(letters).orderBy(sql`${letters.created_at} DESC`).all();
        return rows.map((row: any) => ({
            ...row,
            is_read: !!row.is_read,
            is_scheduled: !!row.is_scheduled,
            is_vanish: !!row.is_vanish,
        }));
    }

    async getMoods() {
        return db_local.select().from(moods).orderBy(sql`${moods.created_at} DESC`).all();
    }

    async getBucketList() {
        const results = await db_local.select().from(bucketList).where(eq(bucketList.deleted, false)).orderBy(sql`${bucketList.created_at} DESC`).all();
        return results.map(row => ({
            ...row,
            is_completed: !!row.is_completed,
            is_private: !!row.is_private,
            deleted: !!row.deleted
        }));
    }

    async updateBucketItemStatus(id: string, isCompleted: boolean) {
        await db_local.update(bucketList)
            .set({
                is_completed: isCompleted ? 1 : 0,
                updated_at: Date.now()
            } as any)
            .where(eq(bucketList.id, id));
    }

    async updateLetterReadStatus(id: string, isRead: boolean) {
        await db_local.update(letters)
            .set({
                is_read: isRead ? 1 : 0,
                updated_at: Date.now()
            } as any)
            .where(eq(letters.id, id));
    }

    async deleteBucketItem(id: string) {
        // Physical delete is handled by sync cleaner, logical delete for now
        await db_local.update(bucketList)
            .set({ deleted: 1, updated_at: Date.now() } as any)
            .where(eq(bucketList.id, id));
    }

    async getPolaroids() {
        return db_local.select().from(polaroids).where(sql`${polaroids.deleted} IS NOT 1`).orderBy(sql`${polaroids.created_at} DESC`).all();
    }

    async savePolaroidLocal(polaroid: any) {
        const payload: any = {
            id: polaroid.id,
            image_url: polaroid.image_url || null,
            caption: polaroid.caption || null,
            polaroid_date: polaroid.polaroid_date || null,
            user_id: polaroid.user_id || null,
            created_at: polaroid.created_at || Date.now(),
            updated_at: Date.now(),
            deleted: 0,
        };

        await db_local.insert(polaroids).values(payload).onConflictDoUpdate({
            target: polaroids.id,
            set: payload,
        });
    }

    async deleteMemory(id: string) {
        await db_local.delete(memories).where(eq(memories.id, id));
    }

    // Music State Persistence
    async getMusicState(id: string) {
        const row = await db_local.select().from(musicState).where(eq(musicState.id, id)).get();
        if (!row) return null;
        return {
            ...row,
            current_track: row.current_track ? JSON.parse(row.current_track) : null,
            queue: row.queue ? JSON.parse(row.queue) : [],
            playlist: row.playlist ? JSON.parse(row.playlist) : [],
        };
    }

    async saveMusicState(id: string, state: Partial<any>) {
        const existing = await db_local.select().from(musicState).where(eq(musicState.id, id)).get();

        const data: any = {
            id,
            current_track: state.current_track ? JSON.stringify(state.current_track) : (existing?.current_track || null),
            queue: state.queue ? JSON.stringify(state.queue) : (existing?.queue || "[]"),
            playlist: state.playlist ? JSON.stringify(state.playlist) : (existing?.playlist || "[]"),
            is_playing: state.is_playing !== undefined ? (state.is_playing ? 1 : 0) : (existing?.is_playing || 0),
            progress_ms: state.progress_ms !== undefined ? state.progress_ms : (existing?.progress_ms || 0),
            last_updated: Date.now(),
            updated_at: Date.now()
        };

        await db_local.insert(musicState).values(data).onConflictDoUpdate({
            target: musicState.id,
            set: data
        });
    }
}

export const repository = new Repository();
