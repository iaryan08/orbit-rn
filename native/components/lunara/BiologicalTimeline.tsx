import React, { useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable, Dimensions, Platform } from 'react-native';
import Animated from 'react-native-reanimated';
import { Typography, Spacing, Radius, Colors } from '../../constants/Theme';
import { Sparkles, Droplets } from 'lucide-react-native';
import { PagerLockGesture } from '../../components/PagerLockGesture';
import { PhaseWindow } from '../../lib/cycle';

const IS_ANDROID = Platform.OS === 'android';
const { width } = Dimensions.get('window');
const ITEM_WIDTH = 66;
const ITEM_GAP = 8;

interface DayItem {
    date: Date;
    dayOfCycle: number;
    phase: PhaseWindow;
    isToday: boolean;
    isOvulation: boolean;
    isPeriod: boolean;
    isFertile: boolean;
}

interface BiologicalTimelineProps {
    days: DayItem[];
    selectedDay: number;
    onSelectDay: (day: number) => void;
}

// Stable day cell — memoized to prevent any rerender cascade
const DayCell = React.memo(({ item, isSelected, onPress }: {
    item: DayItem;
    isSelected: boolean;
    onPress: () => void;
}) => {
    const phaseColor = item.phase.color;

    return (
        <Pressable
            onPress={onPress}
            style={({ pressed }) => [
                styles.cell,
                isSelected && { backgroundColor: `${phaseColor}22`, borderColor: phaseColor },
                { opacity: pressed ? 0.7 : 1, transform: [{ scale: pressed ? 0.95 : 1 }] }
            ]}
        >
            {/* Phase color bar top */}
            <View style={[styles.phaseBar, { backgroundColor: phaseColor, opacity: isSelected ? 1 : 0.35 }]} />

            <Text style={[styles.dateNum, isSelected && { color: phaseColor }]}>
                {item.date.getDate()}
            </Text>
            <Text style={[styles.dateMonth, isSelected && { color: phaseColor, opacity: 0.9 }]}>
                {item.isToday ? 'Today' : item.date.toLocaleDateString('en', { weekday: 'short' })}
            </Text>

            <View style={styles.markerRow}>
                {item.isOvulation && <Sparkles size={10} color="#fbbf24" />}
                {item.isPeriod && <Droplets size={10} color="#fb7185" />}
                {item.isFertile && !item.isOvulation && <View style={[styles.fertileDot, { backgroundColor: '#34d399' }]} />}
                {!item.isOvulation && !item.isPeriod && !item.isFertile && (
                    <View style={[styles.phaseDot, { backgroundColor: phaseColor }]} />
                )}
            </View>

            {isSelected && <View style={[styles.selectedBar, { backgroundColor: phaseColor }]} />}
        </Pressable>
    );
}, (prev, next) => prev.isSelected === next.isSelected && prev.item.dayOfCycle === next.item.dayOfCycle);

export const BiologicalTimeline = React.memo(({ days, selectedDay, onSelectDay }: BiologicalTimelineProps) => {
    const listRef = useRef<any>(null);
    // Auto-scroll to today or selected on mount
    useEffect(() => {
        const targetIdx = days.findIndex(d => d.dayOfCycle === selectedDay);
        if (targetIdx >= 0 && listRef.current) {
            // Delay slightly to ensure layout
            const timer = setTimeout(() => {
                listRef.current?.scrollToIndex({ index: targetIdx, animated: true, viewPosition: 0.5 });
            }, 100);
            return () => clearTimeout(timer);
        }
    }, []);

    const renderItem = useCallback(({ item }: { item: DayItem }) => (
        <DayCell
            item={item}
            isSelected={selectedDay === item.dayOfCycle}
            onPress={() => onSelectDay(item.dayOfCycle)}
        />
    ), [selectedDay, onSelectDay]);

    return (
        <View style={styles.container}>
            <PagerLockGesture>
                <Animated.FlatList
                    ref={listRef}
                    data={days}
                    renderItem={renderItem}
                    keyExtractor={(item) => item.dayOfCycle.toString()}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.scrollContent}
                    snapToInterval={ITEM_WIDTH + ITEM_GAP}
                    decelerationRate="fast"
                    // Performance Props
                    getItemLayout={(_, index) => ({
                        length: ITEM_WIDTH + ITEM_GAP,
                        offset: (ITEM_WIDTH + ITEM_GAP) * index,
                        index,
                    })}
                    windowSize={5}
                    maxToRenderPerBatch={5}
                    initialNumToRender={10}
                    removeClippedSubviews={IS_ANDROID}
                    scrollEventThrottle={16}
                />
            </PagerLockGesture>
        </View>
    );
});

const styles = StyleSheet.create({
    container: { height: 106, marginVertical: Spacing.md },
    scrollContent: { paddingHorizontal: Spacing.md, alignItems: 'center', gap: ITEM_GAP },
    cell: {
        width: ITEM_WIDTH,
        height: 90,
        borderRadius: Radius.lg,
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        position: 'relative',
    },
    phaseBar: { position: 'absolute', top: 0, left: 0, right: 0, height: 2, borderRadius: 1 },
    dateNum: { fontSize: 20, fontFamily: Typography.sansBold, color: 'rgba(255,255,255,0.7)', lineHeight: 26 },
    dateMonth: { fontSize: 13, fontFamily: Typography.sans, color: 'rgba(255,255,255,0.5)', letterSpacing: 0.5, marginBottom: 6 },
    markerRow: { height: 12, alignItems: 'center', justifyContent: 'center' },
    fertileDot: { width: 6, height: 6, borderRadius: 3 },
    phaseDot: { width: 4, height: 4, borderRadius: 2, opacity: 0.4 },
    selectedBar: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, borderRadius: 1 },
});
