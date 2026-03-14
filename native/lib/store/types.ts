export interface Comment {
    user_avatar_url?: string | null;
    id: string;
    user_id: string;
    user_name?: string | null;
    text: string;
    created_at: any;
}

export interface PolaroidData {
    id: string;
    image_url: string;
    caption: string | null;
    created_at: any;
    user_id: string | null;
    polaroid_date: string | null;
    comments?: Comment[];
}

export interface MemoryData {
    id: string;
    title: string;
    content: string | null;
    description?: string | null;
    image_url: string | null;
    image_urls?: string[] | null;
    sender_id?: string | null;
    sender_name?: string | null;
    couple_id?: string | null;
    memory_date?: string | null;
    created_at: any;
    updated_at?: any;
    read_by?: string[] | null;
    type?: 'image' | 'video' | 'text';
    source?: string;
    source_polaroid_id?: string | null;
    deleted?: boolean;
    comments?: Comment[];
}

export interface LetterData {
    id: string;
    title: string | null;
    content: string;
    sender_id: string;
    sender_name: string | null;
    receiver_id: string | null;
    unlock_type?: string | null;
    unlock_date?: string | null;
    is_scheduled: boolean;
    scheduled_delivery_time?: number | null;
    is_vanish: boolean;
    created_at: any;
    updated_at?: any;
    is_read: boolean;
}

export interface MoodData {
    id: string;
    emoji: string;
    mood_text: string | null;
    mood_date: string;
    user_id: string;
    created_at: any;
}

export interface BucketItem {
    id: string;
    title: string;
    description: string | null;
    is_completed: boolean;
    is_private: boolean;
    created_at: any;
    created_by: string;
    deleted: boolean;
}
