import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Target } from 'lucide-react-native';
import Animated from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { Colors, Radius, Spacing, Typography } from '../../constants/Theme';
import { GlassCard } from '../GlassCard';
import { useOrbitStore } from '../../lib/store';
import * as Haptics from 'expo-haptics';

export const BucketListWidget = React.memo(() => {
    const { bucketList, setTabIndex, profile } = useOrbitStore();

    const filteredList = useMemo(() => {
        return bucketList.filter(item => {
            if (!item.is_private) return true;
            return item.created_by === profile?.id;
        });
    }, [bucketList, profile?.id]);

    const completedCount = filteredList.filter(i => i.is_completed).length;
    const totalCount = filteredList.length;
    const progress = totalCount === 0 ? 0 : (completedCount / totalCount);

    const activeItems = filteredList
        .filter(item => !item.is_completed)
        .slice(0, 3);

    return (
        <Animated.View>
            <GlassCard style={styles.bucketCard} intensity={12}>
                <View style={styles.bucketHeader}>
                    <View style={styles.bucketTitleRow}>
                        <View style={styles.bucketIconContainer}>
                            <Target size={20} color={Colors.dark.rose[400]} />
                        </View>
                        <View>
                            <Text style={styles.bucketTitle}>Bucket List</Text>
                            <Text style={styles.bucketSubtitle}>ADVENTURES SYNCED</Text>
                        </View>
                    </View>

                    <View style={styles.progressContainer}>
                        <Svg width="40" height="40" style={styles.progressSvg}>
                            <Circle
                                cx="20"
                                cy="20"
                                r="18"
                                stroke="rgba(255,255,255,0.05)"
                                strokeWidth="3"
                                fill="none"
                            />
                            <Circle
                                cx="20"
                                cy="20"
                                r="18"
                                stroke={Colors.dark.rose[400]}
                                strokeWidth="3"
                                strokeDasharray={`${progress * 113} 113`}
                                fill="none"
                                strokeLinecap="round"
                            />
                        </Svg>
                        <View style={styles.progressTextContainer}>
                            <Text style={styles.progressCompleted}>{completedCount}</Text>
                            <View style={styles.progressDivider} />
                            <Text style={styles.progressTotal}>{totalCount}</Text>
                        </View>
                    </View>
                </View>

                <View style={styles.bucketItemsList}>
                    {activeItems.map((item) => (
                        <View key={item.id} style={styles.bucketItemRow}>
                            <View style={styles.itemCheck}>
                                {item.is_completed && <View style={styles.itemCheckActive} />}
                            </View>
                            <Text style={styles.itemText} numberOfLines={1}>{item.title}</Text>
                        </View>
                    ))}
                </View>

                <TouchableOpacity
                    style={styles.viewMoreBtn}
                    onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                        setTabIndex(4, 'tap');
                    }}
                >
                    <Text style={styles.viewMoreText}>VIEW FULL LIST</Text>
                </TouchableOpacity>
            </GlassCard>
        </Animated.View>
    );
});

const styles = StyleSheet.create({
    bucketCard: { margin: Spacing.sm, borderRadius: Radius.xl, padding: 24, borderWidth: 1, borderColor: 'rgba(225, 29, 72, 0.08)' },
    bucketHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
    bucketTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
    bucketIconContainer: { width: 40, height: 40, borderRadius: 10, backgroundColor: 'rgba(225, 29, 72, 0.05)', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(225, 29, 72, 0.1)' },
    bucketTitle: { color: 'white', fontSize: 20, fontFamily: Typography.serifBold, letterSpacing: -0.5 },
    bucketSubtitle: { color: 'rgba(255,255,255,0.55)', fontSize: 12, fontFamily: Typography.sansBold, letterSpacing: 1.5, marginTop: 2 },
    progressContainer: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
    progressSvg: { transform: [{ rotate: '-90deg' }] },
    progressTextContainer: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
    progressCompleted: { color: 'white', fontSize: 13, fontFamily: Typography.sansBold, lineHeight: 9 },
    progressDivider: { width: 6, height: 1, backgroundColor: 'rgba(255,255,255,0.45)', marginVertical: 0.5 },
    progressTotal: { color: 'rgba(255,255,255,0.55)', fontSize: 11, fontFamily: Typography.sansBold, lineHeight: 7 },
    bucketItemsList: { gap: 8 },
    bucketItemRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        padding: 12,
        borderRadius: 100,
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
        marginBottom: 4
    },
    itemCheck: { width: 18, height: 18, borderRadius: Radius.full, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.45)', alignItems: 'center', justifyContent: 'center' },
    itemCheckActive: { backgroundColor: Colors.dark.rose[500], borderColor: Colors.dark.rose[500] },
    itemText: { color: 'rgba(255,255,255,0.92)', fontSize: 13, fontFamily: Typography.sansBold, flex: 1 },
    viewMoreBtn: { marginTop: 16, alignItems: 'center', paddingVertical: 8 },
    viewMoreText: { color: 'rgba(255,255,255,0.65)', fontSize: 13, fontFamily: Typography.sansBold, letterSpacing: 1.5 },
});
