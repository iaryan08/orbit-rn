import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Sparkles, ChevronRight } from 'lucide-react-native';
import Animated from 'react-native-reanimated';
import { Colors, Typography } from '../../constants/Theme';
import { GlassCard } from '../GlassCard';
import { useOrbitStore } from '../../lib/store';

export const MusicHeartbeat = React.memo(() => {
    const isPlaying = useOrbitStore(state => state.musicState?.is_playing);
    const track = useOrbitStore(state => state.musicState?.current_track);
    
    if (!isPlaying || !track) return null;

    return (
        <Animated.View>
            <GlassCard style={styles.musicCard} intensity={20}>
                <View style={styles.musicInfo}>
                    <View style={styles.musicIconWrapper}>
                        <View style={styles.musicIconBox}>
                            <Sparkles size={16} color={Colors.dark.rose[400]} fill={Colors.dark.rose[400]} />
                        </View>
                    </View>
                    <View style={styles.musicTextGroup}>
                        <Text style={styles.musicStatus}>Synced Audio</Text>
                        <Text style={styles.musicTitle} numberOfLines={1}>{track.title || 'Unknown Track'}</Text>
                        <Text style={styles.musicArtist} numberOfLines={1}>{track.artist || 'Unknown Artist'}</Text>
                    </View>
                </View>
                <ChevronRight size={14} color="rgba(255,255,255,0.2)" />
            </GlassCard>
        </Animated.View>
    );
});

const styles = StyleSheet.create({
    musicCard: {
        padding: 16,
        marginBottom: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    musicInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    musicIconWrapper: {
        marginRight: 16,
    },
    musicIconBox: {
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: 'rgba(244, 63, 94, 0.1)',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(244, 63, 94, 0.2)',
    },
    musicTextGroup: {
        flex: 1,
    },
    musicStatus: {
        fontSize: 13,
        fontFamily: Typography.sansBold,
        color: Colors.dark.rose[400],
        letterSpacing: 1,
        textTransform: 'uppercase',
        marginBottom: 2,
    },
    musicTitle: {
        fontSize: 15,
        fontFamily: Typography.serif,
        color: 'white',
    },
    musicArtist: {
        fontSize: 12,
        fontFamily: Typography.sans,
        color: 'rgba(255,255,255,0.75)',
    },
});
