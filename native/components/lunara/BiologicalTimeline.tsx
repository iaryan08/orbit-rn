import React, { useMemo, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions } from 'react-native';
import { Typography, Colors, Radius, Spacing } from '../../constants/Theme';
import { Sparkles, Moon, Flame, Droplets } from 'lucide-react-native';

const { width } = Dimensions.get('window');
const ITEM_WIDTH = 60;

interface DayItem {
    date: Date;
    dayOfCycle: number;
    phase: string;
    isToday: boolean;
    isOvulation: boolean;
    isPeriod: boolean;
}

interface BiologicalTimelineProps {
    days: DayItem[];
    selectedDay: number;
    onSelectDay: (day: number) => void;
}

export const BiologicalTimeline = React.memo(({ days, selectedDay, onSelectDay }: BiologicalTimelineProps) => {
    const scrollRef = useRef<ScrollView>(null);

    return (
        <View style={styles.container}>
            <ScrollView
                ref={scrollRef}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
                snapToInterval={ITEM_WIDTH}
                decelerationRate="fast"
            >
                {days.map((item, idx) => {
                    const isSelected = selectedDay === item.dayOfCycle;

                    return (
                        <TouchableOpacity
                            key={idx}
                            onPress={() => onSelectDay(item.dayOfCycle)}
                            style={[
                                styles.dayItem,
                                isSelected && styles.dayItemActive
                            ]}
                        >
                            <Text style={[styles.dayNum, isSelected && styles.textActive]}>
                                {item.date.getDate()}
                            </Text>
                            <Text style={[styles.dayLabel, isSelected && styles.textActive]}>
                                {item.isToday ? 'Today' : `D${item.dayOfCycle}`}
                            </Text>

                            <View style={styles.iconContainer}>
                                {item.isOvulation && <Sparkles size={12} color="#fbbf24" />}
                                {item.isPeriod && <Droplets size={12} color="#fb7185" />}
                                {!item.isOvulation && !item.isPeriod && <View style={styles.dot} />}
                            </View>

                            {isSelected && <View style={styles.activeIndicator} />}
                        </TouchableOpacity>
                    );
                })}
            </ScrollView>
        </View>
    );
});

const styles = StyleSheet.create({
    container: {
        height: 100,
        marginVertical: Spacing.md,
    },
    scrollContent: {
        paddingHorizontal: Spacing.lg,
        alignItems: 'center',
    },
    dayItem: {
        width: ITEM_WIDTH,
        height: 80,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: Radius.lg,
        backgroundColor: 'rgba(255,255,255,0.03)',
        marginRight: 10,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
    },
    dayItemActive: {
        backgroundColor: 'rgba(168,85,247,0.15)',
        borderColor: 'rgba(168,85,247,0.3)',
    },
    dayNum: {
        fontSize: 18,
        fontFamily: Typography.sansBold,
        color: 'rgba(255,255,255,0.4)',
    },
    dayLabel: {
        fontSize: 9,
        fontFamily: Typography.sans,
        color: 'rgba(255,255,255,0.2)',
        textTransform: 'uppercase',
        marginTop: 2,
    },
    textActive: {
        color: '#c084fc',
    },
    iconContainer: {
        marginTop: 8,
        height: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    dot: {
        width: 4,
        height: 4,
        borderRadius: 2,
        backgroundColor: 'rgba(255,255,255,0.1)',
    },
    activeIndicator: {
        position: 'absolute',
        bottom: 8,
        width: 4,
        height: 4,
        borderRadius: 2,
        backgroundColor: '#c084fc',
    }
});
