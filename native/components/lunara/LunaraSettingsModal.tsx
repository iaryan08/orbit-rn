import React, { useState } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity,
    ScrollView, Modal, Platform, TextInput,
    Alert, Switch
} from 'react-native';
import { Colors, Radius, Spacing, Typography } from '../../constants/Theme';
import {
    X, Check, Calendar, ChevronRight,
    Sparkles, Settings2, History, RotateCcw,
    Droplets, Repeat
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { GlassCard } from '../GlassCard';
import { useOrbitStore } from '../../lib/store';
import { doc, updateDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db, auth } from '../../lib/firebase';
import DateTimePicker from '@react-native-community/datetimepicker';

interface LunaraSettingsModalProps {
    visible: boolean;
    onClose: () => void;
    onResetPersonalization: () => void;
}

export const LunaraSettingsModal = ({ visible, onClose, onResetPersonalization }: LunaraSettingsModalProps) => {
    const profile = useOrbitStore(state => state.profile);
    const setProfile = useOrbitStore(state => state.setProfile);
    const activeCoupleId = useOrbitStore(state => state.activeCoupleId);

    const cycleProfile = profile?.cycle_profile || {
        avg_cycle_length: 28,
        avg_period_length: 5,
        period_history: [],
        last_period_start: null,
        last_period_end: null
    };

    const [avgCycle, setAvgCycle] = useState(cycleProfile.avg_cycle_length?.toString() || '28');
    const [avgPeriod, setAvgPeriod] = useState(cycleProfile.avg_period_length?.toString() || '5');
    const [isDatePickerVisible, setIsDatePickerVisible] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const handleSave = async () => {
        if (!auth.currentUser || !activeCoupleId) return;

        const cycleLength = parseInt(avgCycle);
        const periodLength = parseInt(avgPeriod);

        if (isNaN(cycleLength) || cycleLength < 20 || cycleLength > 45) {
            Alert.alert('Invalid Cycle Length', 'Please enter a value between 20 and 45 days.');
            return;
        }

        if (isNaN(periodLength) || periodLength < 2 || periodLength > 12) {
            Alert.alert('Invalid Period Length', 'Please enter a value between 2 and 12 days.');
            return;
        }

        setIsSaving(true);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

        try {
            const nextProfileCycle = {
                ...cycleProfile,
                avg_cycle_length: cycleLength,
                avg_period_length: periodLength,
                updated_at: new Date().toISOString()
            };

            // 1. Update store
            setProfile({
                ...profile,
                cycle_profile: nextProfileCycle
            });

            // 2. Persist to Firestore (Couple context)
            await setDoc(
                doc(db, 'couples', activeCoupleId, 'cycle_profiles', auth.currentUser.uid),
                {
                    avg_cycle_length: cycleLength,
                    avg_period_length: periodLength,
                    updated_at: serverTimestamp(),
                },
                { merge: true }
            );

            // 3. Mirror to User doc
            await updateDoc(
                doc(db, 'users', auth.currentUser.uid),
                {
                    cycle_profile: nextProfileCycle,
                    updated_at: serverTimestamp(),
                }
            );

            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            onClose();
        } catch (e) {
            console.error('[LunaraSettings] Save error:', e);
            Alert.alert('Error', 'Failed to save settings.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDateChange = (event: any, selectedDate?: Date) => {
        setIsDatePickerVisible(false);
        if (selectedDate && auth.currentUser && activeCoupleId) {
            const dateStr = selectedDate.toISOString().split('T')[0];
            confirmDateUpdate(dateStr);
        }
    };

    const confirmDateUpdate = (dateStr: string) => {
        Alert.alert(
            'Update Last Period?',
            `Set last period start to ${dateStr}? This will recalculate your entire cycle.`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Confirm',
                    onPress: async () => {
                        try {
                            const history = cycleProfile.period_history || [];
                            const nextHistory = [...new Set([dateStr, ...history])].sort().reverse().slice(0, 24);

                            const nextProfileCycle = {
                                ...cycleProfile,
                                last_period_start: dateStr,
                                period_history: nextHistory,
                                updated_at: new Date().toISOString()
                            };

                            setProfile({ ...profile, cycle_profile: nextProfileCycle });

                            await setDoc(
                                doc(db, 'couples', activeCoupleId, 'cycle_profiles', auth.currentUser!.uid),
                                {
                                    last_period_start: dateStr,
                                    period_history: nextHistory,
                                    updated_at: serverTimestamp(),
                                },
                                { merge: true }
                            );

                            await updateDoc(
                                doc(db, 'users', auth.currentUser!.uid),
                                {
                                    cycle_profile: nextProfileCycle,
                                    updated_at: serverTimestamp(),
                                }
                            );
                            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                        } catch (e) {
                            console.error('[LunaraSettings] Date update error:', e);
                        }
                    }
                }
            ]
        );
    };

    return (
        <Modal
            visible={visible}
            animationType="slide"
            transparent={true}
            statusBarTranslucent={true}
            onRequestClose={onClose}
        >
            <View style={styles.overlay}>
                <View style={styles.container}>
                    <GlassCard style={styles.card} intensity={40}>
                        <View style={styles.header}>
                            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                                <X size={24} color="white" />
                            </TouchableOpacity>
                            <Text style={styles.headerTitle}>Lunara Intelligence</Text>
                            <TouchableOpacity
                                onPress={handleSave}
                                style={[styles.saveBtn, isSaving && { opacity: 0.5 }]}
                                disabled={isSaving}
                            >
                                <Check size={20} color="white" />
                            </TouchableOpacity>
                        </View>

                        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
                            <View style={styles.section}>
                                <Text style={styles.sectionTitle}>BIOLOGICAL DEFAULTS</Text>

                                <View style={styles.inputRow}>
                                    <View style={styles.inputLabelCol}>
                                        <Repeat size={18} color={Colors.dark.rose[400]} />
                                        <Text style={styles.inputLabel}>Normal Cycle Days</Text>
                                    </View>
                                    <TextInput
                                        style={styles.textInput}
                                        value={avgCycle}
                                        onChangeText={setAvgCycle}
                                        keyboardType="number-pad"
                                        placeholder="28"
                                        placeholderTextColor="rgba(255,255,255,0.2)"
                                    />
                                </View>

                                <View style={styles.inputRow}>
                                    <View style={styles.inputLabelCol}>
                                        <Droplets size={18} color={Colors.dark.rose[400]} />
                                        <Text style={styles.inputLabel}>Normal Period Days</Text>
                                    </View>
                                    <TextInput
                                        style={styles.textInput}
                                        value={avgPeriod}
                                        onChangeText={setAvgPeriod}
                                        keyboardType="number-pad"
                                        placeholder="5"
                                        placeholderTextColor="rgba(255,255,255,0.2)"
                                    />
                                </View>
                            </View>

                            <View style={styles.section}>
                                <Text style={styles.sectionTitle}>CALIBRATION</Text>

                                <TouchableOpacity
                                    style={styles.menuItem}
                                    onPress={() => setIsDatePickerVisible(true)}
                                >
                                    <View style={styles.menuIconBox}>
                                        <Calendar size={20} color="white" />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.menuTitle}>Modify Last Period Date</Text>
                                        <Text style={styles.menuDesc}>Fix incorrect logging or missed days</Text>
                                    </View>
                                    <ChevronRight size={18} color="rgba(255,255,255,0.3)" />
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={styles.menuItem}
                                    onPress={() => {
                                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                        // TODO: Implement History Viewer if needed, for now just show alert
                                        Alert.alert('Period History', cycleProfile.period_history?.join(', ') || 'No history recorded.');
                                    }}
                                >
                                    <View style={[styles.menuIconBox, { backgroundColor: 'rgba(168, 85, 247, 0.2)' }]}>
                                        <History size={20} color="#a855f7" />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.menuTitle}>Manage History</Text>
                                        <Text style={styles.menuDesc}>View and edit past cycle start dates</Text>
                                    </View>
                                    <ChevronRight size={18} color="rgba(255,255,255,0.3)" />
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={[styles.menuItem, { borderBottomWidth: 0 }]}
                                    onPress={() => {
                                        Alert.alert(
                                            'Reset Personalization?',
                                            'This will clear your tailored insights and restart the onboarding process.',
                                            [
                                                { text: 'Cancel', style: 'cancel' },
                                                {
                                                    text: 'Reset',
                                                    style: 'destructive',
                                                    onPress: onResetPersonalization
                                                }
                                            ]
                                        );
                                    }}
                                >
                                    <View style={[styles.menuIconBox, { backgroundColor: 'rgba(251,113,133,0.1)' }]}>
                                        <RotateCcw size={20} color={Colors.dark.rose[400]} />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.menuTitle}>Reset Onboarding</Text>
                                        <Text style={styles.menuDesc}>Redo the initial personalization questions</Text>
                                    </View>
                                    <ChevronRight size={18} color="rgba(255,255,255,0.3)" />
                                </TouchableOpacity>
                            </View>

                            <View style={styles.infoBox}>
                                <Settings2 size={16} color="rgba(255,255,255,0.4)" />
                                <Text style={styles.infoText}>
                                    Lunara uses weighted biological modeling. Adjusting these values will instantly update your predictions and partner's view.
                                </Text>
                            </View>
                        </ScrollView>
                    </GlassCard>
                </View>
            </View>

            {isDatePickerVisible && (
                <DateTimePicker
                    value={cycleProfile.last_period_start ? new Date(cycleProfile.last_period_start) : new Date()}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    maximumDate={new Date()}
                    onChange={handleDateChange}
                />
            )}
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.85)',
        justifyContent: 'flex-end',
    },
    container: {
        height: '80%',
        width: '100%',
    },
    card: {
        flex: 1,
        borderTopLeftRadius: Radius.xl,
        borderTopRightRadius: Radius.xl,
        backgroundColor: '#0A0A0C',
        overflow: 'hidden',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 20,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.05)',
    },
    headerTitle: {
        fontSize: 16,
        fontFamily: Typography.sansBold,
        color: 'white',
        letterSpacing: 1.5,
        textTransform: 'uppercase',
    },
    closeBtn: {
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
    },
    saveBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: Colors.dark.rose[600],
        alignItems: 'center',
        justifyContent: 'center',
    },
    scroll: {
        flex: 1,
        padding: 20,
    },
    section: {
        marginBottom: 32,
    },
    sectionTitle: {
        fontSize: 10,
        fontFamily: Typography.sansBold,
        color: 'rgba(255,255,255,0.4)',
        letterSpacing: 1.5,
        marginBottom: 16,
    },
    inputRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.05)',
    },
    inputLabelCol: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    inputLabel: {
        fontSize: 15,
        fontFamily: Typography.sans,
        color: 'rgba(255,255,255,0.9)',
    },
    textInput: {
        fontSize: 18,
        fontFamily: Typography.sansBold,
        color: 'white',
        textAlign: 'right',
        minWidth: 50,
        padding: 0,
    },
    menuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 18,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.05)',
        gap: 16,
    },
    menuIconBox: {
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.05)',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    menuTitle: {
        fontSize: 15,
        fontFamily: Typography.sansBold,
        color: 'white',
        marginBottom: 2,
    },
    menuDesc: {
        fontSize: 12,
        fontFamily: Typography.sans,
        color: 'rgba(255,255,255,0.4)',
    },
    infoBox: {
        flexDirection: 'row',
        gap: 12,
        backgroundColor: 'rgba(255,255,255,0.02)',
        padding: 16,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
        marginBottom: 40,
    },
    infoText: {
        flex: 1,
        fontSize: 12,
        fontFamily: Typography.sans,
        color: 'rgba(255,255,255,0.4)',
        lineHeight: 18,
    }
});
