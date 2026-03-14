import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Clock } from 'lucide-react-native';
import Animated from 'react-native-reanimated';
import { Image } from 'expo-image';
import { Colors, Typography } from '../../constants/Theme';
import { GlassCard } from '../GlassCard';
import { useOrbitStore } from '../../lib/store';
import { getPartnerName } from '../../lib/utils';
import { getPublicStorageUrl } from '../../lib/storage';
import { usePersistentMedia } from '../../lib/media';

export const OnThisDayWidget = React.memo(() => {
    const memories = useOrbitStore(s => s.memories);
    const partnerProfile = useOrbitStore(s => s.partnerProfile);
    const profile = useOrbitStore(s => s.profile);
    const idToken = useOrbitStore(s => s.idToken);

    const partnerName = getPartnerName(profile, partnerProfile);
    const onThisDayMemories = useMemo(() => {
        const today = new Date();
        const m = today.getMonth();
        const d = today.getDate();
        
        return memories.filter(memory => {
            const date = new Date(getComparableTimestamp(memory.created_at));
            return date.getMonth() === m && date.getDate() === d && date.getFullYear() < today.getFullYear();
        }).sort((a, b) => getComparableTimestamp(b.created_at) - getComparableTimestamp(a.created_at));
    }, [memories]);

    if (onThisDayMemories.length === 0) return null;

    const memory = onThisDayMemories[0];
    const memoryDate = getComparableTimestamp(memory.created_at);
    const yearsAgo = new Date().getFullYear() - new Date(memoryDate).getFullYear();

    const rawUrl = useMemo(() => 
        memory.image_url ? getPublicStorageUrl(memory.image_url, 'memories', idToken) : null,
        [memory.image_url, idToken]
    );
    const sourceUri = usePersistentMedia(memory.image_url || undefined, rawUrl || undefined, true);

    return (
        <Animated.View>
            <GlassCard style={styles.memoryCard} intensity={20}>
                <View style={styles.memoryHeader}>
                    <Clock size={18} color={Colors.dark.rose[400]} />
                    <Text style={styles.memoryTitle}>On This Day</Text>
                    <View style={styles.yearsBadge}>
                        <Text style={styles.yearsText}>{yearsAgo} {yearsAgo === 1 ? 'YEAR' : 'YEARS'} AGO</Text>
                    </View>
                </View>

                <View style={styles.memoryContent}>
                    {(memory.image_url || sourceUri) && (
                        <Image
                            source={{ uri: sourceUri || rawUrl || undefined }}
                            style={styles.memoryImage}
                            contentFit="cover"
                            transition={200}
                        />
                    )}
                    <View style={styles.memoryInfo}>
                        <Text style={styles.memoryCaption} numberOfLines={2}>{memory.content || memory.title}</Text>
                        <Text style={styles.memoryDate}>{new Date(memoryDate).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</Text>
                    </View>
                </View>
            </GlassCard>
        </Animated.View>
    );
});

const getComparableTimestamp = (value: any): number => {
    if (typeof value === 'number') return value;
    if (value?.toMillis && typeof value.toMillis === 'function') return value.toMillis();
    if (value?.seconds && typeof value.seconds === 'number') return value.seconds * 1000;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

const styles = StyleSheet.create({
    memoryCard: {
        padding: 20,
        marginBottom: 16,
        overflow: 'hidden',
    },
    memoryHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginBottom: 16,
    },
    memoryTitle: {
        fontSize: 16,
        fontFamily: Typography.serif,
        color: 'white',
    },
    yearsBadge: {
        marginLeft: 'auto',
        backgroundColor: Colors.dark.rose[500] + '30',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 6,
    },
    yearsText: {
        fontSize: 13,
        fontFamily: Typography.sansBold,
        color: Colors.dark.rose[400],
        letterSpacing: 0.5,
    },
    memoryContent: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
    },
    memoryImage: {
        width: 60,
        height: 60,
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.05)',
    },
    memoryInfo: {
        flex: 1,
    },
    memoryCaption: {
        fontSize: 14,
        fontFamily: Typography.serifItalic,
        color: 'white',
        lineHeight: 20,
    },
    memoryDate: {
        fontSize: 11,
        fontFamily: Typography.sans,
        color: 'rgba(255,255,255,0.65)',
        marginTop: 4,
    },
});
