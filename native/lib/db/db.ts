import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync } from 'expo-sqlite';
import * as schema from './schema';

// Best-in-Class: Use a unique database name for Orbit V2 to avoid conflicts
const sqlite = openDatabaseSync('orbit_v2.db');

export const db_local = drizzle(sqlite, { schema });

// Initialization logic: Ensure tables exist
export async function initializeDatabase() {
    try {
        // 1. Create all tables (Fresh install or missing tables)
        const tables = [
            `CREATE TABLE IF NOT EXISTS sync_metadata (collection TEXT PRIMARY KEY, last_synced_at INTEGER NOT NULL);`,
            `CREATE TABLE IF NOT EXISTS memories (id TEXT PRIMARY KEY, title TEXT NOT NULL, content TEXT, description TEXT, image_url TEXT, image_urls TEXT, sender_id TEXT, sender_name TEXT, couple_id TEXT, memory_date INTEGER, read_by TEXT, created_at INTEGER, updated_at INTEGER);`,
            `CREATE TABLE IF NOT EXISTS polaroids (id TEXT PRIMARY KEY, image_url TEXT NOT NULL, caption TEXT, polaroid_date TEXT, created_at INTEGER, user_id TEXT, updated_at INTEGER);`,
            `CREATE TABLE IF NOT EXISTS letters (id TEXT PRIMARY KEY, title TEXT, content TEXT NOT NULL, sender_id TEXT NOT NULL, receiver_id TEXT, sender_name TEXT, unlock_type TEXT, unlock_date TEXT, is_scheduled INTEGER DEFAULT 0, scheduled_delivery_time INTEGER, is_vanish INTEGER DEFAULT 0, created_at INTEGER, is_read INTEGER DEFAULT 0, updated_at INTEGER);`,
            `CREATE TABLE IF NOT EXISTS moods (id TEXT PRIMARY KEY, emoji TEXT NOT NULL, mood_text TEXT, mood_date TEXT NOT NULL, user_id TEXT NOT NULL, created_at INTEGER, updated_at INTEGER);`,
            `CREATE TABLE IF NOT EXISTS bucket_list (id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT, is_completed INTEGER DEFAULT 0, is_private INTEGER DEFAULT 0, deleted INTEGER DEFAULT 0, created_at INTEGER, created_by TEXT NOT NULL, updated_at INTEGER);`,
            `CREATE TABLE IF NOT EXISTS music_state (id TEXT PRIMARY KEY, current_track TEXT, queue TEXT, playlist TEXT, is_playing INTEGER DEFAULT 0, progress_ms INTEGER DEFAULT 0, last_updated INTEGER, updated_at INTEGER);`,
            `CREATE TABLE IF NOT EXISTS couples (id TEXT PRIMARY KEY, user1_id TEXT, user2_id TEXT, anniversary_date TEXT, paired_at TEXT, wallpaper_url TEXT, updated_at INTEGER);`,
            `CREATE TABLE IF NOT EXISTS profiles (id TEXT PRIMARY KEY, display_name TEXT, avatar_url TEXT, couple_id TEXT, partner_id TEXT, is_partner INTEGER DEFAULT 0, location_city TEXT, location_json TEXT, bio TEXT, updated_at INTEGER);`
        ];

        tables.forEach(sql => {
            try {
                sqlite.execSync(sql);
            } catch (e) {
                console.error(`[DB] Error executing: ${sql.slice(0, 50)}...`, e);
            }
        });

        // 2. Migrations: Add missing columns if they exist in older DBs
        const columns = [
            'content', 'image_urls', 'sender_id', 'sender_name',
            'couple_id', 'memory_date', 'read_by'
        ];

        columns.forEach(col => {
            try {
                sqlite.execSync(`ALTER TABLE memories ADD COLUMN ${col} TEXT;`);
                console.log(`[DB] Migration: Added ${col} to memories.`);
            } catch (e) {
                // Column likely already exists
            }
        });

        const letterColumns = [
            'title TEXT',
            'receiver_id TEXT',
            'sender_name TEXT',
            'unlock_type TEXT',
            'unlock_date TEXT',
            'is_scheduled INTEGER DEFAULT 0',
            'scheduled_delivery_time INTEGER',
            'is_vanish INTEGER DEFAULT 0'
        ];
        letterColumns.forEach(def => {
            const colName = def.split(' ')[0];
            try {
                sqlite.execSync(`ALTER TABLE letters ADD COLUMN ${def}; `);
                console.log(`[DB] Migration: Added ${colName} to letters.`);
            } catch (e) {
                // Column likely already exists
            }
        });

        const profileColumns = [
            'location_city TEXT',
            'location_json TEXT',
            'bio TEXT'
        ];
        profileColumns.forEach(def => {
            const colName = def.split(' ')[0];
            try {
                sqlite.execSync(`ALTER TABLE profiles ADD COLUMN ${def};`);
                console.log(`[DB] Migration: Added ${colName} to profiles.`);
            } catch (e) {
                // Column likely already exists
            }
        });

        // 2c. Polaroids & Bucket List migrations
        try {
            sqlite.execSync(`ALTER TABLE polaroids ADD COLUMN polaroid_date TEXT;`);
            console.log(`[DB] Migration: Added polaroid_date to polaroids.`);
        } catch (e) { }

        try {
            sqlite.execSync(`ALTER TABLE bucket_list ADD COLUMN deleted INTEGER DEFAULT 0;`);
            console.log(`[DB] Migration: Added deleted to bucket_list.`);
        } catch (e) { }

        try {
            sqlite.execSync(`ALTER TABLE memories ADD COLUMN deleted INTEGER DEFAULT 0;`);
            console.log(`[DB] Migration: Added deleted to memories.`);
        } catch (e) { }

        try {
            sqlite.execSync(`ALTER TABLE polaroids ADD COLUMN deleted INTEGER DEFAULT 0;`);
            console.log(`[DB] Migration: Added deleted to polaroids.`);
        } catch (e) { }

        // Migration: Reset memories sync timestamp so image_urls are re-fetched.
        try {
            const hasMigrated = sqlite.getFirstSync<{ last_synced_at: number }>(
                `SELECT last_synced_at FROM sync_metadata WHERE collection = '_memories_v2_migrated'`
            );
            if (!hasMigrated) {
                sqlite.execSync(`DELETE FROM sync_metadata WHERE collection = 'memories'; `);
                sqlite.execSync(`DELETE FROM sync_metadata WHERE collection = 'polaroids'; `);
                sqlite.execSync(`INSERT OR IGNORE INTO sync_metadata(collection, last_synced_at) VALUES('_memories_v2_migrated', 1); `);
                console.log('[DB] Migration v2: Reset memories+polaroids sync for full image_urls re-sync.');
            }
        } catch (e) {
            // Fresh install — no sync_metadata yet
        }

        console.log("[DB] Local SQLite tables verified.");
    } catch (e) {
        console.error("[DB] Initialization error", e);
    }
}
