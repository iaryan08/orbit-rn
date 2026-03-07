import { Capacitor } from '@capacitor/core';
import { CapacitorSQLite, SQLiteConnection, SQLiteDBConnection } from '@capacitor-community/sqlite';

// Schema for offline-first sync
const DB_SCHEMA = `
  CREATE TABLE IF NOT EXISTS memories (
    id TEXT PRIMARY KEY NOT NULL,
    couple_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    title TEXT,
    description TEXT,
    image_urls TEXT, -- JSON array
    local_image_urls TEXT, -- JSON array of local URIs
    location TEXT,
    memory_date TEXT NOT NULL,
    is_encrypted INTEGER DEFAULT 0,
    iv TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    pending_sync INTEGER DEFAULT 1,
    deleted INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS profiles (
    id TEXT PRIMARY KEY NOT NULL,
    display_name TEXT,
    avatar_url TEXT,
    couple_id TEXT,
    partner_id TEXT,
    gender TEXT,
    city TEXT,
    timezone TEXT,
    latitude REAL,
    longitude REAL,
    location_source TEXT,
    email TEXT,
    couple_code TEXT,
    fcm_token TEXT,
    local_avatar_url TEXT,
    custom_wallpaper_url TEXT,
    local_custom_wallpaper_url TEXT,
    wallpaper_overlay_type TEXT DEFAULT 'dark',
    wallpaper_grayscale INTEGER DEFAULT 0,
    wallpaper_mode TEXT DEFAULT 'theme',
    wallpaper_mode_updated_at TEXT,
    bio TEXT,
    anniversary_date TEXT,
    birthday TEXT,
    last_viewed_memories_at TEXT,
    last_viewed_letters_at TEXT,
    is_admin INTEGER DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL,
    pending_sync INTEGER DEFAULT 1,
    deleted INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS couples (
    id TEXT PRIMARY KEY NOT NULL,
    user1_id TEXT NOT NULL,
    user2_id TEXT NOT NULL,
    anniversary_date TEXT,
    paired_at TEXT,
    couple_name TEXT,
    couple_code TEXT,
    wallpaper_user1 TEXT,
    local_wallpaper_user1 TEXT,
    wallpaper_user1_updated_at TEXT,
    wallpaper_user2 TEXT,
    local_wallpaper_user2 TEXT,
    wallpaper_user2_updated_at TEXT,
    wallpaper_shared TEXT,
    local_wallpaper_shared TEXT,
    wallpaper_shared_updated_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL,
    pending_sync INTEGER DEFAULT 1,
    deleted INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS moods (
    id TEXT PRIMARY KEY NOT NULL,
    couple_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    emoji TEXT NOT NULL,
    mood_text TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    pending_sync INTEGER DEFAULT 1,
    deleted INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS love_letters (
    id TEXT PRIMARY KEY NOT NULL,
    couple_id TEXT NOT NULL,
    sender_id TEXT NOT NULL,
    receiver_id TEXT NOT NULL,
    title TEXT,
    content TEXT NOT NULL,
    unlock_date TEXT,
    unlock_type TEXT,
    is_read INTEGER DEFAULT 0,
    read_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    pending_sync INTEGER DEFAULT 1,
    deleted INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS cycle_profiles (
    user_id TEXT PRIMARY KEY NOT NULL,
    couple_id TEXT NOT NULL,
    avg_cycle_length INTEGER,
    avg_period_length INTEGER,
    last_period_start TEXT,
    period_ended_at TEXT,
    regularity TEXT,
    contraception TEXT,
    trying_to_conceive INTEGER DEFAULT 0,
    typical_symptoms TEXT, -- JSON array
    tracking_goals TEXT, -- JSON array
    sharing_enabled INTEGER DEFAULT 1,
    privacy_level TEXT,
    updated_at TEXT NOT NULL,
    pending_sync INTEGER DEFAULT 1,
    deleted INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS cycle_logs (
    id TEXT PRIMARY KEY NOT NULL,
    couple_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    log_date TEXT NOT NULL,
    symptoms TEXT, -- JSON array
    mood TEXT,
    moods TEXT, -- JSON array
    flow TEXT,
    flow_level TEXT,
    notes TEXT,
    sex_drive TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    pending_sync INTEGER DEFAULT 1,
    deleted INTEGER DEFAULT 0,
    UNIQUE(user_id, log_date)
  );

  CREATE TABLE IF NOT EXISTS support_logs (
    id TEXT PRIMARY KEY NOT NULL,
    couple_id TEXT NOT NULL,
    created_by TEXT NOT NULL,
    log_date TEXT NOT NULL,
    action_type TEXT NOT NULL, -- e.g. 'water', 'snack'
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    pending_sync INTEGER DEFAULT 1,
    deleted INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS polaroids (
    id TEXT PRIMARY KEY NOT NULL,
    couple_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    image_url TEXT NOT NULL,
    local_image_url TEXT,
    caption TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    pending_sync INTEGER DEFAULT 1,
    deleted INTEGER DEFAULT 0,
    UNIQUE(user_id, couple_id)
  );

  CREATE TABLE IF NOT EXISTS doodles (
    id TEXT PRIMARY KEY NOT NULL,
    couple_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    path_data TEXT, -- JSON string
    updated_at TEXT NOT NULL,
    pending_sync INTEGER DEFAULT 1,
    deleted INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS bucket_list (
    id TEXT PRIMARY KEY NOT NULL,
    couple_id TEXT NOT NULL,
    created_by TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    is_completed INTEGER DEFAULT 0,
    completed_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    pending_sync INTEGER DEFAULT 1,
    deleted INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS game_sessions (
    id TEXT PRIMARY KEY NOT NULL,
    couple_id TEXT NOT NULL,
    game_type TEXT NOT NULL,
    status TEXT NOT NULL,
    current_state TEXT, -- JSON string
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    pending_sync INTEGER DEFAULT 1,
    deleted INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS milestones (
    id TEXT PRIMARY KEY NOT NULL,
    couple_id TEXT NOT NULL,
    category TEXT NOT NULL,
    milestone_date TEXT,
    date_user1 TEXT,
    date_user2 TEXT,
    content_user1 TEXT,
    content_user2 TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    pending_sync INTEGER DEFAULT 1,
    deleted INTEGER DEFAULT 0,
    UNIQUE(couple_id, category)
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY NOT NULL,
    couple_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL,
    title TEXT,
    body TEXT,
    is_read INTEGER DEFAULT 0,
    data TEXT, -- JSON string
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    pending_sync INTEGER DEFAULT 1,
    deleted INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS memory_comments (
    id TEXT PRIMARY KEY NOT NULL,
    memory_id TEXT NOT NULL,
    couple_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    pending_sync INTEGER DEFAULT 1,
    deleted INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS polaroid_comments (
    id TEXT PRIMARY KEY NOT NULL,
    polaroid_id TEXT NOT NULL,
    couple_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    pending_sync INTEGER DEFAULT 1,
    deleted INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS content_pins_local (
    id TEXT PRIMARY KEY NOT NULL,
    couple_id TEXT NOT NULL,
    item_type TEXT NOT NULL,
    item_id TEXT NOT NULL,
    pinned_by TEXT NOT NULL,
    share_with_partner INTEGER DEFAULT 1,
    pinned_at TEXT NOT NULL,
    expires_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(couple_id, item_type, item_id)
  );

  CREATE INDEX IF NOT EXISTS idx_memories_couple_id ON memories(couple_id);
  CREATE INDEX IF NOT EXISTS idx_profiles_couple_id ON profiles(couple_id);
  CREATE INDEX IF NOT EXISTS idx_moods_couple_id ON moods(couple_id);
  CREATE INDEX IF NOT EXISTS idx_love_letters_couple_id ON love_letters(couple_id);
  CREATE INDEX IF NOT EXISTS idx_cycle_profiles_couple_id ON cycle_profiles(couple_id);
  CREATE INDEX IF NOT EXISTS idx_cycle_logs_couple_id ON cycle_logs(couple_id);
  CREATE INDEX IF NOT EXISTS idx_support_logs_couple_id ON support_logs(couple_id);
  CREATE INDEX IF NOT EXISTS idx_notifications_couple_id ON notifications(couple_id);
  CREATE INDEX IF NOT EXISTS idx_memory_comments_memory_id ON memory_comments(memory_id);
  CREATE INDEX IF NOT EXISTS idx_polaroid_comments_polaroid_id ON polaroid_comments(polaroid_id);
  CREATE INDEX IF NOT EXISTS idx_content_pins_local_couple_type ON content_pins_local(couple_id, item_type, pinned_at DESC);
`;

class SQLiteService {
  private sqlite: SQLiteConnection | null = null;
  private db: SQLiteDBConnection | null = null;
  private isInitializing = false;
  private initPromise: Promise<void> | null = null;

  constructor() { }

  async init(): Promise<void> {
    if (this.db) return;
    if (this.isInitializing && this.initPromise) {
      return this.initPromise;
    }

    this.isInitializing = true;
    this.initPromise = this._init();
    await this.initPromise;
    this.isInitializing = false;
  }

  private async _init(): Promise<void> {
    try {
      if (!Capacitor.isNativePlatform()) {
        console.log('[SQLiteService] Skipping initialization on non-native platform.');
        return;
      }

      // Initialize connection only on native
      if (!this.sqlite) {
        this.sqlite = new SQLiteConnection(CapacitorSQLite);
      }

      // Check connections consistency
      await this.sqlite.checkConnectionsConsistency();
      const hasConn = await this.sqlite.isConnection('orbit_db', false);

      if (hasConn.result) {
        this.db = await this.sqlite.retrieveConnection('orbit_db', false);
      } else {
        this.db = await this.sqlite.createConnection('orbit_db', false, 'no-encryption', 1, false);
      }

      await this.db.open();

      // Initialize schema
      await this.db.execute(DB_SCHEMA);

      // Migrations for existing deployments
      try { await this.db.execute("ALTER TABLE profiles ADD COLUMN email TEXT;"); } catch { }
      try { await this.db.execute("ALTER TABLE profiles ADD COLUMN couple_code TEXT;"); } catch { }
      try { await this.db.execute("ALTER TABLE profiles ADD COLUMN fcm_token TEXT;"); } catch { }
      try { await this.db.execute("ALTER TABLE profiles ADD COLUMN is_admin INTEGER DEFAULT 0;"); } catch { }
      try { await this.db.execute("ALTER TABLE couples ADD COLUMN couple_name TEXT;"); } catch { }
      try { await this.db.execute("ALTER TABLE cycle_logs ADD COLUMN flow_level TEXT;"); } catch { }
      try { await this.db.execute("ALTER TABLE cycle_logs ADD COLUMN moods TEXT;"); } catch { }
      try { await this.db.execute("ALTER TABLE cycle_logs ADD COLUMN couple_id TEXT;"); } catch { }
      try { await this.db.execute("ALTER TABLE memories ADD COLUMN is_encrypted INTEGER DEFAULT 0;"); } catch { }
      try { await this.db.execute("ALTER TABLE memories ADD COLUMN iv TEXT;"); } catch { }

      // Fix polaroids unique constraint (SQLite doesn't support ADD UNIQUE)
      // We check if the index exists first
      try {
        await this.db.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_polaroids_user_couple ON polaroids(user_id, couple_id);");
      } catch (e) {
        console.warn('[SQLiteService] Failed to create polaroids unique index:', e);
      }

      console.log('SQLite Database Initialized');
    } catch (e) {
      console.error('Failed to initialize SQLite:', e);
      throw e;
    }
  }

  async getDb(): Promise<SQLiteDBConnection> {
    if (!Capacitor.isNativePlatform()) {
      throw new Error('SQLite is only available on native platforms');
    }

    if (!this.db) {
      await this.init();
    }
    if (!this.db) {
      throw new Error('Database connection failed to initialize');
    }
    return this.db;
  }
}

// Singleton instance
export const sqliteService = new SQLiteService();
