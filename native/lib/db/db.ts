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
        sqlite.execSync(`
            CREATE TABLE IF NOT EXISTS sync_metadata (
                collection TEXT PRIMARY KEY,
                last_synced_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS memories (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                content TEXT,
                description TEXT,
                image_url TEXT,
                image_urls TEXT,
                sender_id TEXT,
                sender_name TEXT,
                couple_id TEXT,
                memory_date INTEGER,
                read_by TEXT,
                created_at INTEGER,
                updated_at INTEGER
            );
            CREATE TABLE IF NOT EXISTS polaroids (
                id TEXT PRIMARY KEY,
                image_url TEXT NOT NULL,
                caption TEXT,
                created_at INTEGER,
                user_id TEXT,
                updated_at INTEGER
            );
            CREATE TABLE IF NOT EXISTS letters (
                id TEXT PRIMARY KEY,
                content TEXT NOT NULL,
                sender_id TEXT NOT NULL,
                created_at INTEGER,
                is_read INTEGER DEFAULT 0,
                updated_at INTEGER
            );
            CREATE TABLE IF NOT EXISTS moods (
                id TEXT PRIMARY KEY,
                emoji TEXT NOT NULL,
                mood_text TEXT,
                mood_date TEXT NOT NULL,
                user_id TEXT NOT NULL,
                created_at INTEGER,
                updated_at INTEGER
            );
            CREATE TABLE IF NOT EXISTS bucket_list (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                description TEXT,
                is_completed INTEGER DEFAULT 0,
                is_private INTEGER DEFAULT 0,
                created_at INTEGER,
                created_by TEXT NOT NULL,
                updated_at INTEGER
            );
        `);

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

        console.log("[DB] Local SQLite tables verified.");
    } catch (e) {
        console.error("[DB] Initialization error", e);
    }
}
