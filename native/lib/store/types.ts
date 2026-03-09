export interface PolaroidData {
    id: string;
    image_url: string;
    caption?: string;
    created_at: any;
    user_id?: string;
    polaroid_date: string;
}

export interface MemoryData {
    id: string;
    title: string;
    content?: string;
    description?: string;
    image_url?: string;
    image_urls?: string[];
    created_at: any;
    sender_id?: string;
    read_by?: string[];
}

export interface LetterData {
    id: string;
    title?: string;
    content: string;
    sender_id: string;
    sender_name?: string;
    receiver_id?: string;
    unlock_type?: string;
    unlock_date?: string | null;
    is_scheduled?: boolean;
    scheduled_delivery_time?: number | null;
    is_vanish?: boolean;
    created_at: any;
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
    description?: string;
    is_completed: boolean;
    is_private: boolean;
    created_at: any;
    created_by: string;
}
