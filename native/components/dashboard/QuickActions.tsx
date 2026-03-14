import React, { useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Lock, Plus, Camera, Sparkles } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useOrbitStore } from '../../lib/store';
import { sendNotification } from '../../lib/notifications';

interface QuickActionsProps {
    profile?: any;
    partnerProfile?: any;
    handlePolaroidUpload: (isCamera: boolean) => void;
}

export const QuickActions = React.memo(({ profile, partnerProfile, handlePolaroidUpload }: QuickActionsProps) => {
    const setMoodDrawerOpen = useOrbitStore(s => s.setMoodDrawerOpen);

    const onLockPress = useCallback(() => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert("Canvas Locked", "Drawing is now disabled to protect your shared art.");
    }, []);

    const onPlusPress = useCallback(() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setMoodDrawerOpen(true);
    }, [setMoodDrawerOpen]);

    const onCameraPress = useCallback(() => {
        Alert.alert(
            "Daily Polaroid",
            "Share a moment from today!",
            [
                { text: "Take Photo", onPress: () => handlePolaroidUpload(true) },
                { text: "Choose from Library", onPress: () => handlePolaroidUpload(false) },
                { text: "Cancel", style: "cancel" }
            ]
        );
    }, [handlePolaroidUpload]);

    const onSparkPress = useCallback(async () => {
        if (!profile?.id || !partnerProfile?.id) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        const result = await sendNotification({
            recipientId: partnerProfile.id,
            actorId: profile.id,
            actorName: profile.display_name,
            type: 'spark',
            title: `${profile.display_name || 'Your partner'} sent a Spark ✨`,
            message: 'Your partner is thinking about you right now.',
            actionUrl: '/dashboard',
        });
        if (result?.success) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
    }, [profile?.id, profile?.display_name, partnerProfile?.id]);

    return (
        <View style={styles.quickActionsRedesign}>
            <TouchableOpacity style={styles.quickActionGlass} onPress={onLockPress}>
                <View style={[styles.quickActionInner, styles.quickActionInnerNeutral]}>
                    <Lock size={20} color="white" />
                </View>
            </TouchableOpacity>

            <TouchableOpacity style={styles.quickActionGlass} onPress={onPlusPress}>
                <View style={[styles.quickActionInner, styles.quickActionInnerIndigo]}>
                    <Plus size={20} color="white" />
                </View>
            </TouchableOpacity>

            <TouchableOpacity style={styles.quickActionGlass} onPress={onCameraPress}>
                <View style={[styles.quickActionInner, styles.quickActionInnerRose]}>
                    <Camera size={20} color="white" />
                </View>
            </TouchableOpacity>

            <TouchableOpacity style={styles.quickActionGlass} onPress={onSparkPress}>
                <View style={[styles.quickActionInner, styles.quickActionInnerViolet]}>
                    <Sparkles size={20} color="white" />
                </View>
            </TouchableOpacity>
        </View>
    );
});

const styles = StyleSheet.create({
    quickActionsRedesign: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 20,
        marginBottom: 32,
        paddingHorizontal: 24,
    },
    quickActionGlass: {
        width: 56,
        height: 56,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
    },
    quickActionInner: {
        width: 44,
        height: 44,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    quickActionInnerNeutral: { backgroundColor: 'rgba(255,255,255,0.1)' },
    quickActionInnerIndigo: { backgroundColor: 'rgba(99,102,241,0.2)' },
    quickActionInnerRose: { backgroundColor: 'rgba(244,63,94,0.2)' },
    quickActionInnerViolet: { backgroundColor: 'rgba(139,92,246,0.2)' },
});
