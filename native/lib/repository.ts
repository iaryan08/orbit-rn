import { db_local } from './db/db';
import { db as firebaseDb } from './firebase';
import { collection, query, where, getDocs, orderBy, limit, Timestamp } from 'firebase/firestore';
import { memories, letters, moods, bucketList, syncMetadata, polaroids, musicState, profiles, couples, cycleLogs } from './db/schema';
import { eq, sql } from 'drizzle-orm';
import { normalizeDate } from './utils';

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
            gender: data.gender || null,
            cycle_profile_json: data.cycle_profile ? JSON.stringify(data.cycle_profile) : (data.cycle_profile_json || null),
            is_partner: isPartner ? 1 : 0,
            updated_at: Date.now(),
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
                if (name === 'cycle_logs') {
                    sanitizedData.data = JSON.stringify(data);
                    sanitizedData.log_date = data.log_date || '';
                    sanitizedData.id = `${data.user_id}_${data.log_date}`;
                }

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
                    created_at: normalizeDate(data.created_at).getTime(),
                    updated_at: updatedAt,
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
                        created_at: normalizeDate(data.created_at).getTime(),
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
        await db_local.update(memories)
            .set({ deleted: 1, updated_at: Date.now() } as any)
            .where(eq(memories.id, id));
    }

    async deletePolaroid(id: string) {
        await db_local.update(polaroids)
            .set({ deleted: 1, updated_at: Date.now() } as any)
            .where(eq(polaroids.id, id));
    }

    async saveLetterLocal(letter: any) {
        try {
            const payload = {
                ...letter,
                is_read: letter.is_read ? 1 : 0,
                is_scheduled: letter.is_scheduled ? 1 : 0,
                is_vanish: letter.is_vanish ? 1 : 0,
                updated_at: letter.updated_at || Date.now()
            };
            await db_local.insert(letters).values(payload as any).onConflictDoUpdate({
                target: letters.id,
                set: payload as any
            });
        } catch (e) {
            console.warn("[Repo] saveLetterLocal failed:", e);
        }
    }

    async saveMemoryLocal(memory: any) {
        try {
            const sanitized = { ...memory };
            if (memory.image_urls) sanitized.image_urls = JSON.stringify(memory.image_urls);
            const payload = {
                ...sanitized,
                deleted: memory.deleted ? 1 : 0,
                updated_at: memory.updated_at || Date.now()
            };
            await db_local.insert(memories).values(payload as any).onConflictDoUpdate({
                target: memories.id,
                set: payload as any
            });
        } catch (e) {
            console.warn("[Repo] saveMemoryLocal failed:", e);
        }
    }

    async saveMoodLocal(mood: any) {
        try {
            const payload = {
                ...mood,
                updated_at: mood.updated_at || Date.now(),
                created_at: mood.created_at || Date.now(),
            };
            await db_local.insert(moods).values(payload as any).onConflictDoUpdate({
                target: moods.id,
                set: payload as any,
            });
        } catch (e) {
            console.warn("[Repo] saveMoodLocal failed:", e);
        }
    }

    async getCycleLogs() {
        const rows = await db_local.select().from(cycleLogs).all();
        const result: Record<string, any> = {};
        rows.forEach(r => {
            if (!result[r.user_id]) result[r.user_id] = {};
            if (r.data) result[r.user_id][r.log_date] = JSON.parse(r.data);
        });
        return result;
    }

    async saveCycleLogLocal(userId: string, logDate: string, data: any) {
        try {
            const payload = {
                id: `${userId}_${logDate}`,
                user_id: userId,
                log_date: logDate,
                data: JSON.stringify(data),
                updated_at: Date.now()
            };
            await db_local.insert(cycleLogs).values(payload as any).onConflictDoUpdate({
                target: cycleLogs.id,
                set: { data: JSON.stringify(data), updated_at: Date.now() }
            });
        } catch (e) {
            console.warn("[Repo] saveCycleLogLocal failed:", e);
        }
    }

    async saveBucketItemLocal(item: any) {
        try {
            const payload = {
                ...item,
                title: typeof item.title === 'string' ? item.title.trim() : item.title,
                is_completed: item.is_completed ? 1 : 0,
                is_private: item.is_private ? 1 : 0,
                deleted: item.deleted ? 1 : 0,
                updated_at: item.updated_at || Date.now(),
            };
            await db_local.insert(bucketList).values(payload as any).onConflictDoUpdate({
                target: bucketList.id,
                set: payload as any,
            });
        } catch (e) {
            console.warn("[Repo] saveBucketItemLocal failed:", e);
        }
    }

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

    async wipeAll() {
        try {
            await db_local.delete(profiles);
            await db_local.delete(couples);
            await db_local.delete(memories);
            await db_local.delete(letters);
            await db_local.delete(moods);
            await db_local.delete(bucketList);
            await db_local.delete(polaroids);
            await db_local.delete(musicState);
            await db_local.delete(syncMetadata);
            await db_local.delete(cycleLogs);
        } catch (e) {
            console.warn("[Repo] Wipe all failed:", e);
        }
    }
}

export const repository = new Repository();
