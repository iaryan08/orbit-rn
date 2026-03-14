import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Mail } from 'lucide-react-native';
import Animated from 'react-native-reanimated';
import { Colors, Typography, Spacing, Radius } from '../../constants/Theme';
import { GlassCard } from '../GlassCard';
import { useOrbitStore } from '../../lib/store';
import { getPartnerName } from '../../lib/utils';
import * as Haptics from 'expo-haptics';

export const LetterPreviewWidget = React.memo(() => {
    const { letters, profile, partnerProfile, setTabIndex } = useOrbitStore();

    // Find the latest letter NOT from the current user
    const latestLetter = useMemo(() => {
        return [...letters].filter(l => l.sender_id !== profile?.id)[0] || null;
    }, [letters, profile?.id]);

    if (!latestLetter) return null;

    return (
        <Animated.View>
            <GlassCard style={styles.letterPreviewCard} intensity={8}>
                <View style={styles.letterPreviewHeader}>
                    <View style={styles.letterIconBox}>
                        <Mail size={18} color={Colors.dark.rose[400]} strokeWidth={1.5} />
                    </View>
                    <View>
                        <Text style={styles.letterLabel}>A SACRED NOTE</Text>
                        <Text style={[styles.letterPreviewTitle, { fontFamily: Typography.script, fontSize: 34, marginTop: -8, color: Colors.dark.rose[400] }]}>
                            {getPartnerName(profile, partnerProfile)}
                        </Text>
                    </View>
                </View>

                <Text style={styles.letterSnippet} numberOfLines={3}>
                    {latestLetter.content}
                </Text>

                <View style={styles.letterFooter}>
                    <Text style={styles.letterFrom}>SENT JUST NOW</Text>
                    <TouchableOpacity
                        style={styles.readMoreBtn}
                        onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                            setTabIndex(2, 'tap'); // Letters tab is 2
                        }}
                    >
                        <Text style={styles.readMoreText}>READ MORE</Text>
                    </TouchableOpacity>
                </View>
            </GlassCard>
        </Animated.View>
    );
});

const styles = StyleSheet.create({
    letterPreviewCard: {
        margin: Spacing.sm,
        padding: 24,
        borderRadius: Radius.xl,
        backgroundColor: 'rgba(5, 5, 10, 0.8)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
    },
    letterPreviewHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
        marginBottom: 20,
    },
    letterIconBox: {
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: 'rgba(251,113,133,0.1)',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(251,113,133,0.2)',
    },
    letterLabel: {
        fontSize: 11,
        fontFamily: Typography.sansBold,
        color: 'rgba(255,255,255,0.82)',
        letterSpacing: 1.2,
    },
    letterPreviewTitle: {
        fontSize: 18,
        fontFamily: Typography.serif,
        color: 'white',
        marginTop: 2,
    },
    letterSnippet: {
        fontSize: 15,
        fontFamily: Typography.serifItalic,
        color: 'rgba(255,255,255,0.88)',
        lineHeight: 24,
        marginBottom: 24,
    },
    letterFooter: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.05)',
        paddingTop: 16,
    },
    letterFrom: {
        fontSize: 11,
        fontFamily: Typography.sansBold,
        color: 'rgba(255,255,255,0.58)',
        letterSpacing: 1.1,
    },
    readMoreBtn: {
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.05)',
    },
    readMoreText: {
        fontSize: 11,
        fontFamily: Typography.sansBold,
        color: 'rgba(255,255,255,0.92)',
        letterSpacing: 0.8,
    },
});
