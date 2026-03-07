import { Capacitor } from '@capacitor/core';
import { sqliteService } from './sqlite';

export type SupportedTables =
    | 'memories'
    | 'profiles'
    | 'couples'
    | 'canvas_state'
    | 'couple_profiles'
    | 'couple_metrics'
    | 'moods'
    | 'love_letters'
    | 'cycle_profiles'
    | 'cycle_logs'
    | 'support_logs'
    | 'polaroids'
    | 'doodles'
    | 'bucket_list'
    | 'game_sessions'
    | 'milestones'
    | 'notifications'
    | 'memory_comments'
    | 'polaroid_comments';

export interface BaseRecord {
    id?: string;
    user_id?: string;
    couple_id: string;
    created_by?: string;
    updated_at?: string;
    pending_sync?: number; // 0 or 1 in SQLite
    deleted?: number; // 0 or 1 in SQLite
}

/**
 * KNOWN_COLUMNS: Whitelist of columns that exist in the local SQLite schema per table.
 *
 * WHY THIS EXISTS: Supabase profile/couple rows may contain columns (e.g. is_admin,
 * key_escrow_blob) that were added to the server-side DB later and not yet in the
 * local SQLite schema. Without this filter, upsertFromSync dynamically builds an
 * INSERT with unknown columns → "no such column" SQLite crash on Android.
 *
 * Whenever you add a column to sqlite.ts DB_SCHEMA, add it here too.
 */
const KNOWN_COLUMNS: Partial<Record<SupportedTables, Set<string>>> = {
    profiles: new Set([
        'id', 'display_name', 'avatar_url', 'couple_id', 'partner_id', 'gender',
        'city', 'timezone', 'latitude', 'longitude', 'location_source', 'email',
        'couple_code', 'fcm_token', 'local_avatar_url', 'custom_wallpaper_url',
        'local_custom_wallpaper_url', 'wallpaper_overlay_type', 'wallpaper_grayscale',
        'wallpaper_mode', 'wallpaper_mode_updated_at', 'bio', 'anniversary_date',
        'birthday', 'last_viewed_memories_at', 'last_viewed_letters_at', 'is_admin',
        'created_at', 'updated_at', 'pending_sync', 'deleted',
    ]),
    couples: new Set([
        'id', 'user1_id', 'user2_id', 'anniversary_date', 'paired_at', 'couple_name',
        'couple_code', 'wallpaper_user1', 'local_wallpaper_user1', 'wallpaper_user1_updated_at',
        'wallpaper_user2', 'local_wallpaper_user2', 'wallpaper_user2_updated_at',
        'wallpaper_shared', 'local_wallpaper_shared', 'wallpaper_shared_updated_at',
        'created_at', 'updated_at', 'pending_sync', 'deleted',
    ]),
    memories: new Set([
        'id', 'couple_id', 'user_id', 'title', 'description', 'image_urls',
        'local_image_urls', 'location', 'memory_date', 'is_encrypted', 'iv',
        'created_at', 'updated_at', 'pending_sync', 'deleted'
    ]),
};

export class LocalDB {
    private static ensurePrimaryKey(tableName: SupportedTables, record: any): any {
        if (record?.id) return record;

        if (tableName === 'milestones' && record?.couple_id && record?.category) {
            return { ...record, id: `ms_${record.couple_id}_${record.category}` };
        }

        if (tableName === 'cycle_profiles' && record?.user_id) {
            return { ...record, id: record.user_id };
        }

        return record;
    }

    /**
     * Helper to stringify objects/arrays for SQLite storage and handle booleans
     */
    private static serialize(data: any): any {
        const serialized: any = {};
        for (const [key, value] of Object.entries(data)) {
            if (value !== null && typeof value === 'object') {
                serialized[key] = JSON.stringify(value);
            } else if (typeof value === 'boolean') {
                serialized[key] = value ? 1 : 0;
            } else {
                serialized[key] = value;
            }
        }
        return serialized;
    }

    /**
     * Insert a new record into the local database and mark it for sync.
     * Auto-sets `updated_at`, `pending_sync = 1`, and `deleted = 0`.
     */
    static async insert<T extends BaseRecord>(tableName: SupportedTables, record: T): Promise<void> {
        if (!Capacitor.isNativePlatform()) return;
        const db = await sqliteService.getDb();

        const dataToInsert = this.serialize({
            ...this.ensurePrimaryKey(tableName, record),
            updated_at: new Date().toISOString(),
            pending_sync: 1,
            deleted: 0
        });

        const keys = Object.keys(dataToInsert);
        const values = Object.values(dataToInsert);
        const placeholders = keys.map(() => '?').join(', ');

        const query = `
      INSERT INTO ${tableName} (${keys.join(', ')})
      VALUES (${placeholders})
    `;

        await db.run(query, values);
    }

    /**
     * Update an existing record in the local database and mark it for sync.
     * Auto-updates `updated_at` and sets `pending_sync = 1`.
     */
    static async update<T extends BaseRecord>(tableName: SupportedTables, id: string, coupleId: string, updates: Partial<T>): Promise<void> {
        if (!Capacitor.isNativePlatform()) return;
        const db = await sqliteService.getDb();

        const dataToUpdate = this.serialize({
            ...updates,
            updated_at: new Date().toISOString(),
            pending_sync: 1
        });

        const keys = Object.keys(dataToUpdate);
        const values = Object.values(dataToUpdate);

        const setClause = keys.map(k => `${k} = ?`).join(', ');
        const pk = tableName === 'cycle_profiles' ? 'user_id' : 'id';

        const query = `
      UPDATE ${tableName}
      SET ${setClause}
      WHERE ${pk} = ? AND couple_id = ? AND deleted = 0
    `;

        await db.run(query, [...values, id, coupleId]);
    }

    /**
     * Soft delete a record by setting `deleted = 1` and mark it for sync.
     */
    static async delete(tableName: SupportedTables, id: string, coupleId: string): Promise<void> {
        if (!Capacitor.isNativePlatform()) return;
        const db = await sqliteService.getDb();
        const updatedAt = new Date().toISOString();
        const pk = tableName === 'cycle_profiles' ? 'user_id' : 'id';

        const query = `
      UPDATE ${tableName}
      SET deleted = 1, pending_sync = 1, updated_at = ?
      WHERE ${pk} = ? AND couple_id = ?
    `;

        await db.run(query, [updatedAt, id, coupleId]);
    }

    /**
     * Delete all records for a specific table and couple_id (useful for hard-refresh)
     */
    static async clearTable(tableName: SupportedTables, coupleId: string): Promise<void> {
        if (!Capacitor.isNativePlatform()) return;
        const db = await sqliteService.getDb();
        const query = `DELETE FROM ${tableName} WHERE couple_id = ?`;
        await db.run(query, [coupleId]);
    }

    /**
     * Hard delete a record by ID directly from sync engine
     */
    static async markDeleted(tableName: SupportedTables, id: string): Promise<void> {
        try {
            if (!Capacitor.isNativePlatform()) return;
            const db = await sqliteService.getDb();
            const pk = tableName === 'cycle_profiles' ? 'user_id' : 'id';
            await db.run(`DELETE FROM ${tableName} WHERE ${pk} = ?`, [id]);
        } catch (e) {
            console.warn(`[LocalDB] Failed to hard delete ${id} from ${tableName}`, e);
        }
    }


    /**
     * Helper to parse JSON strings and handle booleans when reading from SQLite
     */
    private static deserialize(record: any): any {
        if (!record) return record;
        const deserialized: any = { ...record };
        for (const [key, value] of Object.entries(record)) {
            // Priority: Known boolean columns or obvious 0/1 for sync/delete
            if (['pending_sync', 'deleted', 'is_read', 'trying_to_conceive', 'is_completed', 'sharing_enabled'].includes(key)) {
                deserialized[key] = value === 1;
            } else if (typeof value === 'string' && (value.startsWith('{') || value.startsWith('['))) {
                try {
                    deserialized[key] = JSON.parse(value);
                } catch (e) {
                    // Not valid JSON
                }
            }
        }
        return deserialized;
    }

    /**
     * Query all active (non-deleted) records for a table.
     */
    static async query<T>(tableName: SupportedTables, coupleId: string): Promise<T[]> {
        if (!Capacitor.isNativePlatform()) return [];
        const db = await sqliteService.getDb();

        const query = `
      SELECT * FROM ${tableName}
      WHERE couple_id = ? AND deleted = 0
      ORDER BY updated_at DESC
    `;

        const result = await db.query(query, [coupleId]);
        const values = (result.values || []) as any[];
        return values.map(v => this.deserialize(v)) as T[];
    }

    static async upsertFromSync<T extends BaseRecord>(tableName: SupportedTables, record: T): Promise<void> {
        if (!Capacitor.isNativePlatform()) return;
        const db = await sqliteService.getDb();

        const rawRecord = this.serialize({
            ...this.ensurePrimaryKey(tableName, record),
            updated_at: record.updated_at || new Date().toISOString()
        });

        // Strip keys that don't exist in the local SQLite schema.
        // This makes upsertFromSync future-proof: any new Supabase column that hasn't
        // been added to the local schema yet is silently ignored instead of crashing.
        const allowedColumns = KNOWN_COLUMNS[tableName];
        const serializedRecord = allowedColumns
            ? Object.fromEntries(Object.entries(rawRecord).filter(([k]) => allowedColumns.has(k)))
            : rawRecord;

        const keys = Object.keys(serializedRecord);
        const values = Object.values(serializedRecord);
        const placeholders = keys.map(() => '?').join(', ');
        const updateClause = keys.map(k => `${k} = EXCLUDED.${k}`).join(', ');

        // Handle tables where primary key/unique constraint matches the sync logic
        let conflictClause = 'id';
        if (tableName === 'milestones') conflictClause = 'couple_id, category';
        if (tableName === 'cycle_profiles') conflictClause = 'user_id';
        if (tableName === 'cycle_logs') conflictClause = 'user_id, log_date';
        if (tableName === 'polaroids') conflictClause = 'user_id, couple_id';

        const query = `
      INSERT INTO ${tableName} (${keys.join(', ')})
      VALUES (${placeholders})
      ON CONFLICT(${conflictClause}) DO UPDATE SET
      ${updateClause}
    `;

        await db.run(query, values);
    }

    static async tableExists(tableName: SupportedTables): Promise<boolean> {
        if (!Capacitor.isNativePlatform()) return false;
        const db = await sqliteService.getDb();
        const result = await db.query(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
            [tableName]
        );
        return Array.isArray(result.values) && result.values.length > 0;
    }

    /**
     * Mark a specific record as successfully synced (pending_sync = 0).
     */
    static async markSynced(tableName: SupportedTables, id: string): Promise<void> {
        if (!Capacitor.isNativePlatform()) return;
        const db = await sqliteService.getDb();
        const pk = tableName === 'cycle_profiles' ? 'user_id' : 'id';
        const query = `UPDATE ${tableName} SET pending_sync = 0 WHERE ${pk} = ?`;
        await db.run(query, [id]);
    }

    /**
     * Get all records pending sync for a specific table.
     */
    static async getPendingSync<T>(tableName: SupportedTables): Promise<T[]> {
        if (!Capacitor.isNativePlatform()) return [];
        const db = await sqliteService.getDb();
        const query = `SELECT * FROM ${tableName} WHERE pending_sync = 1`;
        const result = await db.query(query);
        const values = (result.values || []) as any[];
        return values.map(v => this.deserialize(v)) as T[];
    }
    /**
     * Get recent records from a specific table, sorted by created_at desc.
     */
    static async getRecent<T>(tableName: SupportedTables, coupleId: string, limit: number): Promise<T[]> {
        if (!Capacitor.isNativePlatform()) return [];
        const db = await sqliteService.getDb();
        const query = `
            SELECT * FROM ${tableName} 
            WHERE couple_id = ? AND deleted = 0 
            ORDER BY created_at DESC 
            LIMIT ?
        `;
        const result = await db.query(query, [coupleId, limit]);
        const values = (result.values || []) as any[];
        return values.map(v => this.deserialize(v)) as T[];
    }
}
