import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions, Platform } from 'react-native';
import { MapPin, Heart } from 'lucide-react-native';
import Animated from 'react-native-reanimated';
import { Colors, Radius, Spacing, Typography } from '../../constants/Theme';
import { GlassCard } from '../GlassCard';
import { useOrbitStore } from '../../lib/store';
import { getPartnerName } from '../../lib/utils';
import { calculateDistance } from '../../lib/location';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const MarqueeText = ({ children, style, isActive }: any) => {
    return (
        <Text style={style} numberOfLines={1}>{children}</Text>
    );
};

export const LocationWidget = React.memo(({ profile, partnerProfile, couple, isActive = true }: any) => {
    const [currentTime, setCurrentTime] = useState(new Date());

    useEffect(() => {
        if (!isActive) return;
        const timer = setInterval(() => setCurrentTime(new Date()), 60000);
        return () => clearInterval(timer);
    }, [isActive]);

    const formatTime = (date: Date) => {
        const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
        return timeStr.toUpperCase().replace(' ', '');
    };

    const myLoc = profile?.location;
    const partnerLoc = partnerProfile?.location;
    const partnerTimeStr = partnerLoc?.city ? formatTime(currentTime) : "--:--";

    const distanceKm = useMemo(() => {
        if (myLoc?.latitude && partnerLoc?.latitude) {
            return calculateDistance(myLoc.latitude, myLoc.longitude, partnerLoc.latitude, partnerLoc.longitude);
        }
        return null;
    }, [myLoc, partnerLoc]);

    const formatLastUpdated = (timestamp: any) => {
        if (!timestamp) return 'Live tracking';
        const date = new Date(timestamp);
        const diff = Date.now() - date.getTime();
        if (diff < 60000) return 'Just now';
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
        return `${Math.floor(diff / 3600000)}h ago`;
    };

    return (
        <Animated.View>
            <GlassCard style={styles.locationCardRedesign} intensity={10}>
                <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,255,255,0.01)' }]} />
                <View style={styles.locHeader}>
                    <MapPin size={18} color={Colors.dark.rose[400]} />
                    <Text style={styles.locHeaderText}>Proximity Sync</Text>
                </View>

                <View style={[styles.locMainGrid, { alignItems: 'center' }]}>
                    <View style={styles.locSection}>
                        <Text style={styles.locLabelText} numberOfLines={1}>
                            {myLoc?.city || 'Searching...'}
                        </Text>
                        <MarqueeText style={styles.locFullAddress} isActive={isActive}>
                            {myLoc?.subtext || myLoc?.location_name || "-"}
                        </MarqueeText>
                        <Text style={styles.locTimeDisplay}>{formatTime(currentTime)}</Text>
                        <View style={styles.locBadgeContainer}>
                            <View style={[styles.locStatusDot, { backgroundColor: Colors.dark.emerald[400] }]} />
                            <Text style={styles.locStatusText}>
                                {profile?.last_active ? `Updated ${formatLastUpdated(profile.last_active)}` : 'Live Tracking'}
                            </Text>
                        </View>
                    </View>

                    <View style={styles.locBridgeArea}>
                        <View style={styles.locBridgeLine} />
                        <View style={styles.locBridgeCircle}>
                            <Heart size={10} color={Colors.dark.rose[400]} fill={Colors.dark.rose[400]} />
                        </View>
                        {distanceKm !== null && (
                            <View style={styles.locDistanceBadge}>
                                <Text style={styles.locDistanceText}>{Math.round(distanceKm)} KM</Text>
                            </View>
                        )}
                    </View>

                    <View style={[styles.locSection, { alignItems: 'flex-end' }]}>
                        <Text style={[styles.locLabelText, { textAlign: 'right' }]} numberOfLines={1}>
                            {partnerLoc?.city || 'No Signal'}
                        </Text>
                        <MarqueeText style={[styles.locFullAddress, { textAlign: 'right' }]} isActive={isActive}>
                            {partnerLoc?.subtext || partnerLoc?.location_name || "-"}
                        </MarqueeText>
                        <Text style={styles.locTimeDisplay}>{partnerTimeStr}</Text>
                        <View style={styles.locBadgeContainer}>
                            <Text style={[styles.locStatusText, { opacity: 0.4 }]}>
                                {partnerProfile?.last_active ? `Updated ${formatLastUpdated(partnerProfile.last_active)}` : 'Synced'}
                            </Text>
                        </View>
                    </View>
                </View>
            </GlassCard>
        </Animated.View>
    );
});

const styles = StyleSheet.create({
    locationCardRedesign: {
        width: SCREEN_WIDTH - 2 * Spacing.sm,
        margin: Spacing.sm,
        padding: 24,
        paddingHorizontal: 20,
        borderRadius: Radius.xl,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
        overflow: 'hidden',
        height: 220,
        justifyContent: 'center',
        backgroundColor: 'rgba(5, 5, 10, 0.8)',
    },
    locHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 20,
    },
    locHeaderText: {
        color: 'white',
        fontSize: 20,
        fontFamily: Typography.serifBold,
        letterSpacing: -0.5,
    },
    locMainGrid: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    locSection: {
        flex: 1,
    },
    locLabelText: {
        fontSize: 16,
        fontFamily: Typography.serifBold,
        color: 'rgba(255,255,255,0.96)',
        letterSpacing: 0.2,
        height: 22,
    },
    locFullAddress: {
        fontSize: 12,
        fontFamily: Typography.sansBold,
        color: 'rgba(255,255,255,0.58)',
        letterSpacing: 0.3,
        height: 18,
        marginTop: 2,
        marginBottom: 8,
    },
    locTimeDisplay: {
        fontSize: 22,
        fontFamily: Typography.sansBold,
        color: 'white',
        letterSpacing: -0.5,
    },
    locBadgeContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginTop: 8,
    },
    locStatusDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
    },
    locStatusText: {
        fontSize: 14,
        fontFamily: Typography.sansBold,
        color: 'rgba(255,255,255,0.62)',
        letterSpacing: 0.8,
    },
    locBridgeArea: {
        width: 80,
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
    },
    locBridgeLine: {
        position: 'absolute',
        width: 100,
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.05)',
        zIndex: -1,
    },
    locBridgeCircle: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: 'rgba(251,113,133,0.1)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    locDistanceBadge: {
        position: 'absolute',
        bottom: -28,
        backgroundColor: 'rgba(255,255,255,0.03)',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
    },
    locDistanceText: {
        fontSize: 14,
        fontFamily: Typography.sansBold,
        color: 'rgba(255,255,255,0.58)',
        letterSpacing: 0.8,
    },
});
