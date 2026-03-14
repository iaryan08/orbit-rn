import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core';

// Metadata to track Delta Sync timestamps for each collection
export const syncMetadata = sqliteTable('sync_metadata', {
    collection: text('collection').primaryKey(),
    last_synced_at: integer('last_synced_at').notNull(), // Unix timestamp (ms)
});

export const memories = sqliteTable('memories', {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    content: text('content'),
    description: text('description'),
    image_url: text('image_url'),
    image_urls: text('image_urls'), // JSON stringified array
    sender_id: text('sender_id'),
    sender_name: text('sender_name'),
    couple_id: text('couple_id'),
    memory_date: integer('memory_date'), // Timestamp ms
    read_by: text('read_by'), // JSON array of user IDs
    created_at: integer('created_at'), // Firebase timestamp (ms)
    updated_at: integer('updated_at'), // Crucial for Delta Sync
    deleted: integer('deleted', { mode: 'boolean' }).default(false),
});

export const polaroids = sqliteTable('polaroids', {
    id: text('id').primaryKey(),
    image_url: text('image_url').notNull(),
    caption: text('caption'),
    created_at: integer('created_at'),
    user_id: text('user_id'),
    polaroid_date: text('polaroid_date'), // Missing field found
    updated_at: integer('updated_at'),
    deleted: integer('deleted', { mode: 'boolean' }).default(false),
});

export const letters = sqliteTable('letters', {
    id: text('id').primaryKey(),
    title: text('title'),
    content: text('content').notNull(),
    sender_id: text('sender_id').notNull(),
    receiver_id: text('receiver_id'),
    sender_name: text('sender_name'),
    unlock_type: text('unlock_type'),
    unlock_date: text('unlock_date'),
    is_scheduled: integer('is_scheduled', { mode: 'boolean' }).default(false),
    scheduled_delivery_time: integer('scheduled_delivery_time'),
    is_vanish: integer('is_vanish', { mode: 'boolean' }).default(false),
    created_at: integer('created_at'),
    is_read: integer('is_read', { mode: 'boolean' }).default(false),
    updated_at: integer('updated_at'),
});

export const moods = sqliteTable('moods', {
    id: text('id').primaryKey(),
    emoji: text('emoji').notNull(),
    mood_text: text('mood_text'),
    mood_date: text('mood_date').notNull(),
    user_id: text('user_id').notNull(),
    created_at: integer('created_at'),
    updated_at: integer('updated_at'),
});

export const bucketList = sqliteTable('bucket_list', {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    description: text('description'),
    is_completed: integer('is_completed', { mode: 'boolean' }).default(false),
    is_private: integer('is_private', { mode: 'boolean' }).default(false),
    created_at: integer('created_at'),
    created_by: text('created_by').notNull(),
    updated_at: integer('updated_at'),
    deleted: integer('deleted', { mode: 'boolean' }).default(false),
});
export const musicState = sqliteTable('music_state', {
    id: text('id').primaryKey(), // We'll use a fixed key like 'current_session' or couple_id
    current_track: text('current_track'), // JSON stringified track object
    queue: text('queue'), // JSON stringified array of tracks
    playlist: text('playlist'), // JSON stringified array of tracks
    is_playing: integer('is_playing', { mode: 'boolean' }).default(false),
    progress_ms: integer('progress_ms').default(0),
    last_updated: integer('last_updated'), // Local timestamp
    updated_at: integer('updated_at'), // Remote sync timestamp
});

export const couples = sqliteTable('couples', {
    id: text('id').primaryKey(),
    user1_id: text('user1_id'),
    user2_id: text('user2_id'),
    anniversary_date: text('anniversary_date'),
    paired_at: text('paired_at'),
    wallpaper_url: text('wallpaper_url'),
    updated_at: integer('updated_at'),
});

export const profiles = sqliteTable('profiles', {
    id: text('id').primaryKey(),
    display_name: text('display_name'),
    avatar_url: text('avatar_url'),
    couple_id: text('couple_id'),
    partner_id: text('partner_id'),
    partner_nickname: text('partner_nickname'),
    custom_wallpaper_url: text('custom_wallpaper_url'),
    background_aesthetic: text('background_aesthetic'),
    is_partner: integer('is_partner', { mode: 'boolean' }).default(false),
    location_city: text('location_city'),
    location_json: text('location_json'), // Stringified location object {temp, lat, long, etc}
    bio: text('bio'),
    gender: text('gender'),
    cycle_profile_json: text('cycle_profile_json'), // Stringified cycle profile object
    updated_at: integer('updated_at'),
});

export const offlineMutations = sqliteTable('offline_mutations', {
    id: text('id').primaryKey(),
    kind: text('kind').notNull(),
    payload: text('payload').notNull(), // JSON stringified
    created_at: integer('created_at').notNull(),
    attempts: integer('attempts').default(0),
    last_error: text('last_error'),
});
export const cycleLogs = sqliteTable('cycle_logs', {
    id: text('id').primaryKey(), // composite user_id + log_date
    user_id: text('user_id').notNull(),
    log_date: text('log_date').notNull(),
    data: text('data'), // JSON stringified single log entry
    updated_at: integer('updated_at').notNull(),
});
