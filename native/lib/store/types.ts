export interface PolaroidData {
    id: string;
    image_url: string;
    caption?: string;
    created_at: any;
    user_id?: string;
}

export interface MemoryData {
    id: string;
    title: string;
    description?: string;
    image_url?: string;
    created_at: any;
}

export interface LetterData {
    id: string;
    content: string;
    sender_id: string;
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
