import { useCallback } from 'react';
import * as Haptics from 'expo-haptics';
import { useOrbitStore } from '../store';
import { addBucketItem, toggleBucketItem, deleteBucketItem } from '../auth';

export function useBucketListActions() {
    const profile = useOrbitStore(s => s.profile);
    const addBucketItemOptimistic = useOrbitStore(s => s.addBucketItemOptimistic);
    const updateBucketItemOptimistic = useOrbitStore(s => s.updateBucketItemOptimistic);
    const deleteBucketItemOptimistic = useOrbitStore(s => s.deleteBucketItemOptimistic);

    const handleAdd = useCallback(async (text: string, category: string, isPrivate: boolean = false) => {
        if (!profile?.id || !text.trim()) return;

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        addBucketItemOptimistic(text.trim(), isPrivate);
        
        try {
            // lib/auth.ts: addBucketItem(title, description, is_private)
            await addBucketItem(text.trim(), category, isPrivate);
        } catch (error) {
            console.error('Failed to add bucket item:', error);
            // Optionally rollback
        }
    }, [profile?.id, addBucketItemOptimistic]);

    const handleToggle = useCallback(async (itemId: string, currentStatus: boolean) => {
        if (!profile?.id) return;

        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        updateBucketItemOptimistic(itemId, !currentStatus);

        try {
            // lib/auth.ts: toggleBucketItem(id, isCompleted)
            await toggleBucketItem(itemId, !currentStatus);
        } catch (error) {
            console.error('Failed to toggle bucket item:', error);
            // Optionally rollback
        }
    }, [profile?.id, updateBucketItemOptimistic]);

    const handleDelete = useCallback(async (itemId: string) => {
        if (!profile?.id) return;

        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        deleteBucketItemOptimistic(itemId);

        try {
            // lib/auth.ts: deleteBucketItem(id)
            await deleteBucketItem(itemId);
        } catch (error) {
            console.error('Failed to delete bucket item:', error);
            // Optionally rollback
        }
    }, [profile?.id, deleteBucketItemOptimistic]);

    return {
        handleAdd,
        handleToggle,
        handleDelete,
    };
}
