import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Platform } from 'react-native';
import { Calendar, Clock, ChevronDown, Check, Sparkles } from 'lucide-react-native';
import Animated, { useAnimatedStyle, withSpring, withTiming, useSharedValue } from 'react-native-reanimated';
import { Colors, Radius, Spacing, Typography } from '../constants/Theme';
import { useOrbitStore } from '../lib/store';
import { logIntimacyMilestone } from '../lib/auth';
import * as Haptics from 'expo-haptics';
import { auth } from '../lib/firebase';
import DateTimePicker from '@react-native-community/datetimepicker';
import { format } from 'date-fns';
import { parseSafeDate } from '../lib/utils';

interface MilestoneCardProps {
    id: string;
    title: string;
    description: string;
    icon: React.ReactNode;
    existingData?: any;
    isPartner?: boolean;
    prompt?: string;
}

export function MilestoneCard({ id, title, description, icon, existingData, isPartner, prompt }: MilestoneCardProps) {
    const { profile, couple } = useOrbitStore();
    const isUser1 = couple?.user1_id === auth.currentUser?.uid;

    const userContent = isUser1 ? existingData?.content_user1 : existingData?.content_user2;
    const partnerContent = isUser1 ? existingData?.content_user2 : existingData?.content_user1;
    const userDate = isUser1 ? existingData?.date_user1 : existingData?.date_user2;
    const userTime = isUser1 ? existingData?.time_user1 : existingData?.time_user2;

    const [isExpanded, setIsExpanded] = useState(false);
    const [content, setContent] = useState(userContent || '');
    const [date, setDate] = useState(userDate || existingData?.milestone_date || '');
    const [time, setTime] = useState(userTime || existingData?.milestone_time || '');

    // Dual date state for partner if needed
    const partnerDateValue = isUser1 ? existingData?.date_user2 : existingData?.date_user1;
    const partnerTimeValue = isUser1 ? existingData?.time_user2 : existingData?.time_user1;

    const [showDatePicker, setShowDatePicker] = useState(false);
    const [showTimePicker, setShowTimePicker] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [hasNewSuccess, setHasNewSuccess] = useState(false);
    const successTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

    const hasDualDates = ['first_kiss', 'first_surprise', 'first_memory'].includes(id);

    React.useEffect(() => {
        if (!isSaving) {
            setContent(userContent || '');
            setDate(userDate || existingData?.milestone_date || '');
            setTime(userTime || existingData?.milestone_time || '');
        }
    }, [userContent, userDate, userTime, existingData?.milestone_date, existingData?.milestone_time]);

    const expansion = useSharedValue(0);

    const toggleExpand = () => {
        const nextState = !isExpanded;
        setIsExpanded(nextState);
        expansion.value = withSpring(nextState ? 1 : 0, {
            damping: 20,
            stiffness: 200,
            overshootClamping: true
        });
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    };

    const handleSave = async () => {
        if (!content.trim()) return;
        setIsSaving(true);
        const result = await logIntimacyMilestone({
            category: id,
            content: content,
            date: date,
            time: time
        });

        if (result.success) {
            setHasNewSuccess(true);
            if (successTimerRef.current) clearTimeout(successTimerRef.current);
            successTimerRef.current = setTimeout(() => setHasNewSuccess(false), 3000);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            toggleExpand();
        }
        setIsSaving(false);
    };

    React.useEffect(() => {
        return () => {
            if (successTimerRef.current) {
                clearTimeout(successTimerRef.current);
                successTimerRef.current = null;
            }
        };
    }, []);

    const animatedContentStyle = useAnimatedStyle(() => ({
        height: expansion.value * (hasDualDates ? 600 : 520),
        opacity: expansion.value,
        marginTop: expansion.value * 16,
    }));

    const rotationStyle = useAnimatedStyle(() => ({
        transform: [{ rotate: `${expansion.value * 180}deg` }]
    }));

    return (
        <View style={styles.container}>
            <TouchableOpacity
                activeOpacity={0.7}
                onPress={toggleExpand}
                style={styles.header}
            >
                <View style={[styles.iconContainer, (hasNewSuccess || (userContent && userDate)) && styles.iconSuccess]}>
                    {(hasNewSuccess) ? <Sparkles size={20} color="white" /> : icon}
                </View>

                <View style={styles.titleGroup}>
                    <Text style={styles.title}>{title}</Text>
                    <Text style={styles.description}>{description}</Text>
                </View>

                <Animated.View style={rotationStyle}>
                    <ChevronDown size={20} color="rgba(255,255,255,0.3)" />
                </Animated.View>
            </TouchableOpacity>

            <Animated.View style={[styles.expandable, animatedContentStyle]}>
                <View style={styles.divider} />

                <View style={styles.form}>
                    {prompt && <Text style={styles.promptText}>{prompt}</Text>}

                    <View style={styles.row}>
                        <View style={styles.half}>
                            <Text style={styles.label}>DATE</Text>
                            <TouchableOpacity
                                style={styles.inputWrapperRow}
                                onPress={() => setShowDatePicker(true)}
                            >
                                <Calendar size={14} color="rgba(255,150,150,0.3)" />
                                <Text style={styles.pickerText}>
                                    {date ? (() => {
                                        const d = parseSafeDate(date);
                                        return d ? format(d, 'MMM dd, yyyy') : 'Invalid Date';
                                    })() : 'Select Date'}
                                </Text>
                            </TouchableOpacity>
                        </View>
                        <View style={styles.half}>
                            <Text style={styles.label}>TIME</Text>
                            <TouchableOpacity
                                style={styles.inputWrapperRow}
                                onPress={() => setShowTimePicker(true)}
                            >
                                <Clock size={14} color="rgba(255,150,150,0.3)" />
                                <Text style={styles.pickerText}>
                                    {time ? time : 'Select Time'}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    {showDatePicker && (
                        <DateTimePicker
                            value={date ? new Date(date) : new Date()}
                            mode="date"
                            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                            maximumDate={new Date()}
                            onChange={(event, selectedDate) => {
                                setShowDatePicker(false);
                                if (selectedDate) setDate(format(selectedDate, 'yyyy-MM-dd'));
                            }}
                        />
                    )}

                    {showTimePicker && (
                        <DateTimePicker
                            value={new Date()}
                            mode="time"
                            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                            onChange={(event, selectedTime) => {
                                setShowTimePicker(false);
                                if (selectedTime) setTime(format(selectedTime, 'hh:mm a'));
                            }}
                        />
                    )}

                    <Text style={styles.label}>MY HEART</Text>
                    <View style={styles.inputWrapper}>
                        <TextInput
                            style={styles.textInput}
                            placeholder="Note down your perspective..."
                            placeholderTextColor="rgba(255,255,255,0.15)"
                            value={content}
                            onChangeText={setContent}
                            multiline
                        />
                    </View>

                    {hasDualDates && (
                        <View>
                            <Text style={styles.label}>PARTNER'S DATE & TIME</Text>
                            <View style={[styles.row, { marginTop: 8 }]}>
                                <View style={styles.half}>
                                    <View style={[styles.inputWrapperRow, styles.partnerInputRow]}>
                                        <Calendar size={14} color="rgba(255,255,255,0.1)" />
                                        <Text style={styles.partnerPickerText}>
                                            {partnerDateValue ? (() => {
                                                const d = parseSafeDate(partnerDateValue);
                                                return d ? format(d, 'MMM dd, yyyy') : 'Invalid Date';
                                            })() : 'No date set'}
                                        </Text>
                                    </View>
                                </View>
                                <View style={styles.half}>
                                    <View style={[styles.inputWrapperRow, styles.partnerInputRow]}>
                                        <Clock size={14} color="rgba(255,255,255,0.1)" />
                                        <Text style={styles.partnerPickerText}>
                                            {partnerTimeValue ? partnerTimeValue : 'No time set'}
                                        </Text>
                                    </View>
                                </View>
                            </View>
                        </View>
                    )}

                    <Text style={styles.label}>YOUR PERSPECTIVE</Text>
                    <View style={[styles.inputWrapper, styles.partnerInputWrapper]}>
                        <Text style={[styles.textInput, styles.partnerContentText]}>
                            {partnerContent || "Waiting for partner's side of the story..."}
                        </Text>
                    </View>

                    <TouchableOpacity
                        style={[styles.saveButton, (isSaving || !content.trim()) && styles.saveButtonDisabled]}
                        onPress={handleSave}
                        disabled={isSaving || !content.trim()}
                    >
                        {isSaving ? (
                            <Text style={styles.saveButtonText}>SAVING...</Text>
                        ) : (
                            <>
                                <Check size={18} color="white" />
                                <Text style={styles.saveButtonText}>SAVE MEMORY</Text>
                            </>
                        )}
                    </TouchableOpacity>
                </View>
            </Animated.View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        marginHorizontal: 0,
        marginBottom: 12,
        borderRadius: 0,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.05)',
        overflow: 'hidden',
        backgroundColor: 'rgba(20, 20, 20, 0.6)',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: Spacing.lg,
        paddingVertical: 24,
    },
    iconContainer: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: 'rgba(255,255,255,0.05)',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    iconSuccess: {
        backgroundColor: Colors.dark.rose[500],
        borderColor: Colors.dark.rose[500],
    },
    titleGroup: {
        flex: 1,
        marginLeft: 16,
    },
    title: {
        color: 'white',
        fontSize: 18,
        fontFamily: Typography.serif,
    },
    description: {
        color: 'rgba(255,255,255,0.4)',
        fontSize: 11,
        fontFamily: Typography.sansBold,
        letterSpacing: 0.5,
        marginTop: 2,
    },
    expandable: {
        overflow: 'hidden',
    },
    divider: {
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.08)',
        marginHorizontal: Spacing.lg,
    },
    form: {
        padding: Spacing.lg,
        gap: 16,
    },
    label: {
        color: 'rgba(255,255,255,0.3)',
        fontSize: 9,
        fontFamily: Typography.sansBold,
        letterSpacing: 1.5,
    },
    inputWrapper: {
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderRadius: Radius.lg,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
        padding: 12,
        height: 100,
    },
    inputWrapperRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderRadius: Radius.lg,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
        paddingHorizontal: 12,
        height: 44,
        gap: 8,
    },
    pickerText: {
        color: 'white',
        fontSize: 13,
        fontFamily: Typography.sans,
        flex: 1,
    },
    partnerInputRow: {
        backgroundColor: 'rgba(255,255,255,0.01)',
        borderColor: 'rgba(255,255,255,0.03)',
    },
    partnerPickerText: {
        color: 'rgba(255,255,255,0.2)',
        fontSize: 12,
        fontFamily: Typography.sans,
        flex: 1,
    },
    textInput: {
        color: 'white',
        fontSize: 14,
        fontFamily: Typography.serifItalic,
        textAlignVertical: 'top',
        flex: 1,
        opacity: 0.8,
    },
    promptText: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 15,
        fontFamily: Typography.serifItalic,
        marginBottom: 8,
    },
    row: {
        flexDirection: 'row',
        gap: 12,
    },
    half: {
        flex: 1,
        gap: 8,
    },
    saveButton: {
        height: 48,
        borderRadius: 24,
        backgroundColor: Colors.dark.rose[500],
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        marginTop: 8,
    },
    saveButtonDisabled: {
        opacity: 0.5,
    },
    saveButtonText: {
        color: 'white',
        fontFamily: Typography.sansBold,
        fontSize: 13,
        letterSpacing: 1,
    },
    partnerInputWrapper: {
        backgroundColor: 'rgba(255,255,255,0.01)',
        borderColor: 'rgba(255,255,255,0.03)',
        height: 'auto',
        minHeight: 60,
    },
    partnerContentText: {
        color: 'rgba(255,255,255,0.3)',
        fontStyle: 'italic',
    },
});
