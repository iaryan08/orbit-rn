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
});

export const polaroids = sqliteTable('polaroids', {
    id: text('id').primaryKey(),
    image_url: text('image_url').notNull(),
    caption: text('caption'),
    created_at: integer('created_at'),
    user_id: text('user_id'),
    updated_at: integer('updated_at'),
});

export const letters = sqliteTable('letters', {
    id: text('id').primaryKey(),
    content: text('content').notNull(),
    sender_id: text('sender_id').notNull(),
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
});
