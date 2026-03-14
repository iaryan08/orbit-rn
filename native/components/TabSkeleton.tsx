/**
 * TabSkeleton — Instagram-style placeholder cards shown while tab data loads.
 * Shows immediately with no blank state. One universal component for all tabs.
 * Lite Mode: renders static grey blocks (no animation) to save CPU on budget devices.
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Shimmer } from './Shimmer';
import { Spacing } from '../constants/Theme';

interface TabSkeletonProps {
    /** Number of card skeletons to render (default 3) */
    count?: number;
    /** Whether this skeleton is active/visible */
    isActive?: boolean;
}

/** A single shimmering card row mimicking a content card */
const SkeletonCard = ({ isActive }: { isActive: boolean }) => (
    <View style={styles.card}>
        {/* Header row */}
        <View style={styles.headerRow}>
            <Shimmer width={36} height={36} borderRadius={18} isActive={isActive} />
            <View style={styles.headerText}>
                <Shimmer width="55%" height={11} borderRadius={6} isActive={isActive} style={styles.mb6} />
                <Shimmer width="35%" height={8} borderRadius={4} isActive={isActive} />
            </View>
        </View>
        {/* Content lines */}
        <Shimmer width="100%" height={13} borderRadius={6} isActive={isActive} style={styles.mb8} />
        <Shimmer width="80%" height={13} borderRadius={6} isActive={isActive} style={styles.mb8} />
        <Shimmer width="90%" height={13} borderRadius={6} isActive={isActive} />
    </View>
);

/** A wide image-style skeleton for media/insight cards */
const SkeletonBanner = ({ isActive }: { isActive: boolean }) => (
    <View style={styles.banner}>
        <Shimmer width="100%" height={200} borderRadius={20} isActive={isActive} />
        <View style={styles.bannerText}>
            <Shimmer width="60%" height={11} borderRadius={6} isActive={isActive} style={styles.mb6} />
            <Shimmer width="40%" height={8} borderRadius={4} isActive={isActive} />
        </View>
    </View>
);

export const TabSkeleton = React.memo(({ count = 3, isActive = true }: TabSkeletonProps) => {
    return (
        <View style={styles.container}>
            <SkeletonBanner isActive={isActive} />
            {Array.from({ length: count }).map((_, i) => (
                <SkeletonCard key={i} isActive={isActive} />
            ))}
        </View>
    );
});

TabSkeleton.displayName = 'TabSkeleton';

const styles = StyleSheet.create({
    container: {
        paddingTop: 8,
        paddingBottom: 40,
    },
    card: {
        marginHorizontal: Spacing.md,
        marginBottom: 14,
        backgroundColor: 'rgba(255,255,255,0.02)',
        borderRadius: 20,
        padding: 18,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.04)',
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
        gap: 12,
    },
    headerText: {
        flex: 1,
    },
    banner: {
        marginHorizontal: Spacing.md,
        marginBottom: 14,
    },
    bannerText: {
        position: 'absolute',
        bottom: 20,
        left: 20,
    },
    mb6: { marginBottom: 6 },
    mb8: { marginBottom: 8 },
});
