import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, TextInput, Switch, Alert, KeyboardAvoidingView, Platform, Modal } from 'react-native';
import { Colors, Radius, Spacing, Typography } from '../../constants/Theme';
import { GlobalStyles } from '../../constants/Styles';
import {
    User, Heart, Camera, Shield, Zap,
    LogOut, Pencil, Check, Copy, ChevronRight,
    Moon, Sparkles, Wind, Layers, Circle,
    Camera as CameraIcon
} from 'lucide-react-native';
import { GlassCard } from '../../components/GlassCard';
import { auth, db, rtdb } from '../../lib/firebase';
import { signOut } from 'firebase/auth';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { ref, update, serverTimestamp as rtdbServerTimestamp } from 'firebase/database';
import { useRouter } from 'expo-router';
import Animated, { useSharedValue, useAnimatedScrollHandler, FadeIn, FadeOut, useAnimatedStyle, interpolate, Extrapolate } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useOrbitStore, AppSlice } from '../../lib/store';
import * as Haptics from 'expo-haptics';
import { HeaderPill } from '../../components/HeaderPill';
import { Image as ExpoImage } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { uploadWallpaper, deleteWallpaper, uploadAvatar } from '../../lib/auth';
import { getMirrorStats, triggerMirroring } from '../../lib/MirrorService';
import { RefreshCcw, HardDrive, Smartphone, ShieldCheck, Lock } from 'lucide-react-native';
import * as LocalAuthentication from 'expo-local-authentication';

type TabId = 'profile' | 'couple' | 'atmosphere' | 'security' | 'updates';

import { getPublicStorageUrl } from '../../lib/storage';
import { ProfileAvatar } from '../../components/ProfileAvatar';

const WALLPAPER_REMOTE_SYNC_DELAY_MS = 10000;

export function SettingsScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const {
        profile,
        partnerProfile,
        couple,
        idToken,
        appMode,
        setAppMode,
        wallpaperConfig,
        setWallpaperConfig,
        settingsTargetTab,
        setSettingsTargetTab,
        debugApiUrl,
        setDebugApiUrl,
        isAppLockEnabled,
        setAppLockEnabled,
        isBiometricEnabled,
        setBiometricEnabled,
        appPinCode,
        setAppPinCode,
        memories,
        polaroids,
        syncNow
    } = useOrbitStore();

    // Local scroll tracking
    const scrollRef = useRef<Animated.ScrollView>(null);
    const scrollOffset = useSharedValue(0);
    const scrollHandler = useAnimatedScrollHandler({
        onScroll: (event) => {
            scrollOffset.value = event.contentOffset.y;
        },
    });

    // Morphing: Standardized thresholds [30, 80] - Snappier
    const titleAnimatedStyle = useAnimatedStyle(() => ({
        opacity: interpolate(scrollOffset.value, [20, 70], [1, 0], Extrapolate.CLAMP),
        transform: [{ scale: interpolate(scrollOffset.value, [20, 70], [1, 0.9], Extrapolate.CLAMP) }]
    }));

    const sublineAnimatedStyle = useAnimatedStyle(() => ({
        opacity: interpolate(scrollOffset.value, [10, 50], [1, 0], Extrapolate.CLAMP),
    }));

    const headerPillStyle = useAnimatedStyle(() => ({
        opacity: interpolate(scrollOffset.value, [50, 90], [0, 1], Extrapolate.CLAMP),
        transform: [{ translateY: interpolate(scrollOffset.value, [50, 90], [8, 0], Extrapolate.CLAMP) }]
    }));
    const [activeTab, setActiveTab] = useState<TabId>(settingsTargetTab || 'profile');
    const [saving, setSaving] = useState(false);
    const [copied, setCopied] = useState(false);
    const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const wallpaperWriteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pendingWallpaperPatchRef = useRef<{
        wallpaper_mode?: 'stars' | 'custom' | 'shared';
        wallpaper_grayscale?: boolean;
        wallpaper_filter?: 'Natural' | 'Glass' | 'Tint' | 'Pro';
    }>({});
    const lastHapticAtRef = useRef(0);

    // Form states
    const [displayName, setDisplayName] = useState(profile?.display_name || "");
    const [partnerNickname, setPartnerNickname] = useState(profile?.partner_nickname || "");
    const [birthday, setBirthday] = useState(profile?.birthday || "");
    const [coupleName, setCoupleName] = useState(couple?.couple_name || "");
    const [anniversaryDate, setAnniversaryDate] = useState(couple?.anniversary_date || "");
    const [debugUrlInput, setDebugUrlInput] = useState(debugApiUrl || "");
    const [isPinModalVisible, setIsPinModalVisible] = useState(false);
    const [pinInput, setPinInput] = useState('');
    const [pinConfirmInput, setPinConfirmInput] = useState('');

    // APP & DATA (longevity) stats
    const [stats, setStats] = useState<{ totalItems: number, mirroredItems: number, coverage: number, isSafe: boolean } | null>(null);
    const [isVerifying, setIsVerifying] = useState(false);

    const loadStats = async () => {
        const s = await getMirrorStats(memories, polaroids);
        setStats(s);
    };

    useEffect(() => {
        loadStats();
    }, [memories, polaroids]);

    useEffect(() => {
        if (profile) {
            setDisplayName(profile.display_name || "");
            setPartnerNickname(profile.partner_nickname || "");
            setBirthday(profile.birthday || "");
        }
    }, [profile]);

    useEffect(() => {
        if (couple) {
            setCoupleName(couple.couple_name || "");
            setAnniversaryDate(couple.anniversary_date || "");
        }
    }, [couple]);

    useEffect(() => {
        if (settingsTargetTab && settingsTargetTab !== activeTab) {
            setActiveTab(settingsTargetTab);
        }
    }, [settingsTargetTab]);

    useEffect(() => {
        setDebugUrlInput(debugApiUrl || "");
    }, [debugApiUrl]);

    const handleSignOut = async () => {
        Alert.alert("Sign Out", "Are you sure you want to sign out?", [
            { text: "Cancel", style: "cancel" },
            {
                text: "Sign Out",
                style: "destructive",
                onPress: async () => {
                    try {
                        // Explicitly clear presence before sign out
                        if (profile?.id && couple?.id) {
                            const presenceRef = ref(rtdb, `presence/${couple.id}/${profile.id}`);
                            await update(presenceRef, {
                                is_online: false,
                                in_cinema: null,
                                last_changed: rtdbServerTimestamp()
                            });
                        }
                        const { logout } = useOrbitStore.getState();
                        logout();
                        await signOut(auth);
                        router.replace('/login');
                    } catch (error) {
                        console.error("Sign out error", error);
                    }
                }
            }
        ]);
    };

    const handleSaveProfile = async () => {
        if (!profile?.id) return;
        setSaving(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        try {
            await updateDoc(doc(db, 'users', profile.id), {
                display_name: displayName,
                partner_nickname: partnerNickname,
                birthday: birthday,
                updated_at: serverTimestamp(),
            });
            Alert.alert("Success", "Profile updated successfully");
        } catch (e) {
            console.error(e);
        } finally {
            setSaving(false);
        }
    };

    const handleSaveCouple = async () => {
        if (!couple?.id) return;
        setSaving(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        try {
            await updateDoc(doc(db, 'couples', couple.id), {
                couple_name: coupleName,
                anniversary_date: anniversaryDate,
                updated_at: serverTimestamp(),
            });
            Alert.alert("Success", "Space settings updated successfully");
        } catch (e) {
            console.error(e);
        } finally {
            setSaving(false);
        }
    };

    const pulseHaptic = () => {
        const now = Date.now();
        if (now - lastHapticAtRef.current < 80) return;
        lastHapticAtRef.current = now;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    };

    const scheduleWallpaperPersist = (patch: {
        wallpaper_mode?: 'stars' | 'custom' | 'shared';
        wallpaper_grayscale?: boolean;
        wallpaper_aesthetic?: AppSlice['wallpaperConfig']['aesthetic'];
    }) => {
        pendingWallpaperPatchRef.current = {
            ...pendingWallpaperPatchRef.current,
            ...patch,
        };
        if (wallpaperWriteTimerRef.current) {
            clearTimeout(wallpaperWriteTimerRef.current);
        }
        wallpaperWriteTimerRef.current = setTimeout(async () => {
            if (!profile?.id) {
                wallpaperWriteTimerRef.current = null;
                return;
            }
            const mergedPatch = pendingWallpaperPatchRef.current;
            pendingWallpaperPatchRef.current = {};
            wallpaperWriteTimerRef.current = null;
            try {
                await updateDoc(doc(db, 'users', profile.id), {
                    ...mergedPatch,
                    updated_at: serverTimestamp(),
                });
            } catch (e) {
                console.error('[Settings] wallpaper persist failed', e);
            }
        }, WALLPAPER_REMOTE_SYNC_DELAY_MS);
    };

    const handleWallpaperChange = (mode: 'stars' | 'custom' | 'shared') => {
        pulseHaptic();
        setWallpaperConfig({ mode }); // instant visual feedback
        scheduleWallpaperPersist({ wallpaper_mode: mode });
    };

    const handleGrayscaleToggle = (val: boolean) => {
        pulseHaptic();
        setWallpaperConfig({ grayscale: val });
        scheduleWallpaperPersist({ wallpaper_grayscale: val });
    };

    const handleAestheticChange = (aesthetic: AppSlice['wallpaperConfig']['aesthetic']) => {
        pulseHaptic();
        setWallpaperConfig({ aesthetic });
        scheduleWallpaperPersist({ wallpaper_aesthetic: aesthetic });
    };

    const validateAndSavePin = () => {
        if (!/^\d{4}$/.test(pinInput)) {
            Alert.alert('Invalid PIN', 'PIN must be exactly 4 digits.');
            return;
        }
        if (pinInput !== pinConfirmInput) {
            Alert.alert('PIN mismatch', 'Both PIN fields must match.');
            return;
        }
        setAppPinCode(pinInput);
        setPinInput('');
        setPinConfirmInput('');
        setIsPinModalVisible(false);
        Alert.alert('PIN saved', 'App lock PIN updated.');
    };

    const handlePickWallpaper = async () => {
        try {
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                allowsEditing: true,
                aspect: [9, 16],
                quality: 0.7, // Optimized for Redmi 10/12 performance
            });

            if (!result.canceled && result.assets[0].uri) {
                setSaving(true);
                // V2 Engine: Real-time quantization to 2200px Retina standard
                const uploadResult = await uploadWallpaper(result.assets[0].uri);
                if (uploadResult.error) {
                    Alert.alert("Upload Failed", uploadResult.error);
                } else {
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    // Force instant local sync if needed
                    setWallpaperConfig({ mode: 'custom' });
                }
            }
        } catch (e: any) {
            Alert.alert("Error", e.message || "Failed to pick image");
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteWallpaper = async () => {
        Alert.alert("Reset Atmosphere", "Remove your custom wallpaper?", [
            { text: "Cancel", style: "cancel" },
            {
                text: "Delete",
                style: "destructive",
                onPress: async () => {
                    setSaving(true);
                    const result = await deleteWallpaper();
                    if (result.error) {
                        Alert.alert("Error", result.error);
                    } else {
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    }
                    setSaving(false);
                }
            }
        ]);
    };

    const handlePickAvatar = async () => {
        try {
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                allowsEditing: true,
                aspect: [1, 1],
                quality: 0.6,
            });

            if (!result.canceled && result.assets[0].uri) {
                setSaving(true);
                const uploadResult = await uploadAvatar(result.assets[0].uri);
                if (uploadResult.error) {
                    Alert.alert("Upload Failed", uploadResult.error);
                } else {
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                }
            }
        } catch (e: any) {
            Alert.alert("Error", e.message || "Failed to pick avatar");
        } finally {
            setSaving(false);
        }
    };

    const copyPairCode = () => {
        if (couple?.couple_code) {
            setCopied(true);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
            copiedTimerRef.current = setTimeout(() => setCopied(false), 2000);
        }
    };

    useEffect(() => {
        return () => {
            if (copiedTimerRef.current) {
                clearTimeout(copiedTimerRef.current);
                copiedTimerRef.current = null;
            }
            if (wallpaperWriteTimerRef.current) {
                clearTimeout(wallpaperWriteTimerRef.current);
                wallpaperWriteTimerRef.current = null;
            }
        };
    }, []);

    const renderTabContent = () => {
        switch (activeTab) {
            case 'profile':
                return (
                    <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.tabContent}>
                        <View style={styles.avatarSection}>
                            <View style={styles.avatarContainer}>
                                <ProfileAvatar
                                    url={getPublicStorageUrl(profile?.avatar_url, 'avatars', idToken)}
                                    fallbackText={profile?.display_name || 'U'}
                                    size={112}
                                >
                                    <TouchableOpacity
                                        style={styles.avatarEditButton}
                                        onPress={handlePickAvatar}
                                        disabled={saving}
                                    >
                                        <CameraIcon size={20} color="white" />
                                    </TouchableOpacity>
                                </ProfileAvatar>
                            </View>
                        </View>

                        <View style={styles.formGroup}>
                            <Text style={styles.label}>Display Name</Text>
                            <TextInput
                                style={styles.input}
                                value={displayName}
                                onChangeText={setDisplayName}
                                placeholderTextColor="rgba(255,255,255,0.3)"
                            />
                        </View>

                        <View style={styles.formGroup}>
                            <Text style={styles.label}>Birthday</Text>
                            <TextInput
                                style={styles.input}
                                value={birthday}
                                onChangeText={setBirthday}
                                placeholder="DD/MM/YYYY"
                                placeholderTextColor="rgba(255,255,255,0.3)"
                            />
                        </View>

                        <TouchableOpacity
                            style={styles.saveButton}
                            onPress={handleSaveProfile}
                            disabled={saving}
                        >
                            <Text style={styles.saveButtonText}>{saving ? 'Saving...' : 'Save Identity'}</Text>
                        </TouchableOpacity>
                    </Animated.View>
                );
            case 'couple':
                return (
                    <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.tabContent}>
                        <View style={styles.formGroup}>
                            <Text style={styles.label}>Partner Nickname</Text>
                            <TextInput
                                style={styles.input}
                                value={partnerNickname}
                                onChangeText={setPartnerNickname}
                                placeholder="My Love, Bubba..."
                                placeholderTextColor="rgba(255,255,255,0.3)"
                            />
                            <Text style={styles.hint}>This is private to you.</Text>
                        </View>

                        <View style={styles.formGroup}>
                            <Text style={styles.label}>Space Name</Text>
                            <TextInput
                                style={styles.input}
                                value={coupleName}
                                onChangeText={setCoupleName}
                                placeholderTextColor="rgba(255,255,255,0.3)"
                            />
                        </View>

                        <View style={styles.formGroup}>
                            <Text style={styles.label}>Anniversary Date</Text>
                            <TextInput
                                style={styles.input}
                                value={anniversaryDate}
                                onChangeText={setAnniversaryDate}
                                placeholder="DD/MM/YYYY"
                                placeholderTextColor="rgba(255,255,255,0.3)"
                            />
                            <Text style={styles.hint}>Used for milestone countdowns.</Text>
                        </View>

                        <TouchableOpacity
                            style={styles.saveButton}
                            onPress={handleSaveCouple}
                            disabled={saving}
                        >
                            <Text style={styles.saveButtonText}>{saving ? 'Saving...' : 'Save & Apply'}</Text>
                        </TouchableOpacity>
                    </Animated.View>
                );
            case 'atmosphere':
                return (
                    <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.tabContent}>
                        <Text style={styles.sectionTitle}>Atmosphere</Text>
                        <Text style={styles.sectionSub}>Personalize the private celestial space</Text>

                        <View style={styles.bgGrid}>
                            <TouchableOpacity
                                style={[styles.bgOption, wallpaperConfig.mode === 'stars' && styles.activeBg, { backgroundColor: '#000000' }]}
                                onPress={() => handleWallpaperChange('stars')}
                            >
                                <Sparkles size={24} color={wallpaperConfig.mode === 'stars' ? Colors.dark.rose[400] : 'rgba(255,255,255,0.4)'} />
                                <Text style={styles.bgOptionLabel}>Space</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.bgOption, wallpaperConfig.mode === 'custom' && styles.activeBg, { overflow: 'hidden', padding: 0 }]}
                                onPress={() => handleWallpaperChange('custom')}
                            >
                                {profile?.custom_wallpaper_url ? (
                                    <ExpoImage
                                        source={{ uri: getPublicStorageUrl(profile.custom_wallpaper_url, 'wallpapers', idToken) || undefined }}
                                        style={StyleSheet.absoluteFillObject}
                                        contentFit="cover"
                                        transition={0} // Instant thumbnail
                                        cachePolicy="disk"
                                    />
                                ) : (
                                    <>
                                        <CameraIcon size={24} color="rgba(255,255,255,0.4)" />
                                        <Text style={styles.bgOptionLabel}>Custom</Text>
                                    </>
                                )}
                                {profile?.custom_wallpaper_url && <View style={styles.bgOverlay} />}
                                {profile?.custom_wallpaper_url && <Text style={[styles.bgOptionLabel, styles.bgOptionOverlayText]}>Custom</Text>}
                            </TouchableOpacity>

                            {/* Shared/Mirror Option */}
                            <TouchableOpacity
                                style={[styles.bgOption, wallpaperConfig.mode === 'shared' && styles.activeBg, { overflow: 'hidden', padding: 0 }, !partnerProfile?.custom_wallpaper_url && { opacity: 0.5 }]}
                                onPress={() => handleWallpaperChange('shared')}
                                disabled={!partnerProfile?.custom_wallpaper_url}
                            >
                                {partnerProfile?.custom_wallpaper_url ? (
                                    <ExpoImage
                                        source={{ uri: getPublicStorageUrl(partnerProfile.custom_wallpaper_url, 'wallpapers', idToken) || undefined }}
                                        style={StyleSheet.absoluteFillObject}
                                        contentFit="cover"
                                        transition={0} // Instant thumbnail
                                        cachePolicy="disk"
                                    />
                                ) : (
                                    <>
                                        <Heart size={24} color="rgba(255,255,255,0.4)" />
                                        <Text style={styles.bgOptionLabel}>Mirror</Text>
                                    </>
                                )}
                                {partnerProfile?.custom_wallpaper_url && <View style={styles.bgOverlay} />}
                                {partnerProfile?.custom_wallpaper_url && <Text style={[styles.bgOptionLabel, styles.bgOptionOverlayText]}>Mirror</Text>}
                            </TouchableOpacity>
                        </View>

                        {wallpaperConfig.mode === 'custom' && (
                            <View style={styles.customActions}>
                                <TouchableOpacity
                                    style={styles.actionButton}
                                    onPress={handlePickWallpaper}
                                    disabled={saving}
                                >
                                    <CameraIcon size={16} color="white" />
                                    <Text style={styles.actionButtonText}>Change Image</Text>
                                </TouchableOpacity>

                                {profile?.custom_wallpaper_url && (
                                    <TouchableOpacity
                                        style={[styles.actionButton, styles.deleteButton]}
                                        onPress={handleDeleteWallpaper}
                                        disabled={saving}
                                    >
                                        <LogOut size={16} color={Colors.dark.rose[400]} />
                                        <Text style={[styles.actionButtonText, { color: Colors.dark.rose[400] }]}>Remove</Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                        )}

                        <View style={styles.settingRow}>
                            <View style={styles.settingInfo}>
                                <View style={[styles.iconCircle, { backgroundColor: 'rgba(255,255,255,0.05)' }]}>
                                    <Moon size={18} color="white" />
                                </View>
                                <View style={styles.badgeRow}>
                                    <Text style={styles.settingLabel}>Monochromatic</Text>
                                    <View style={styles.premiumBadge}><Text style={styles.premiumBadgeText}>Pro</Text></View>
                                </View>
                            </View>
                            <Switch
                                trackColor={{ false: '#333', true: Colors.dark.rose[900] }}
                                thumbColor={wallpaperConfig.grayscale ? Colors.dark.rose[400] : '#f4f3f4'}
                                value={wallpaperConfig.grayscale}
                                onValueChange={handleGrayscaleToggle}
                            />
                        </View>



                        <View style={[styles.filterSection, (wallpaperConfig.grayscale || wallpaperConfig.mode === 'stars') && { opacity: 0.3 }]} pointerEvents={(wallpaperConfig.grayscale || wallpaperConfig.mode === 'stars') ? 'none' : 'auto'}>
                            <Text style={styles.label}>Aesthetic Customization</Text>
                            <View style={styles.filterGrid}>
                                {[
                                    { key: 'Natural', icon: Circle, color: '#fff', sub: 'Pure' },
                                    { key: 'Obsidian', icon: Moon, color: Colors.dark.amber[400], sub: 'Deep' },
                                    { key: 'Glass', icon: Wind, color: Colors.dark.indigo[400], sub: 'Frost' },
                                    { key: 'Cinema', icon: Sparkles, color: '#A855F7', sub: 'Action' },
                                ].map((item) => (
                                    <TouchableOpacity
                                        key={item.key}
                                        style={[styles.filterButton, wallpaperConfig.aesthetic === item.key && styles.activeFilter]}
                                        onPress={() => handleAestheticChange(item.key as any)}
                                    >
                                        <item.icon size={18} color={wallpaperConfig.aesthetic === item.key ? item.color : 'rgba(255,255,255,0.4)'} />
                                        <Text style={[styles.filterText, wallpaperConfig.aesthetic === item.key && { color: 'white' }]}>{item.key}</Text>
                                        <Text style={styles.filterSubText}>{item.sub}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>
                    </Animated.View>
                );
            case 'updates':
                return (
                    <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.tabContent}>
                        <Text style={styles.sectionTitle}>App & Data</Text>
                        <Text style={styles.sectionSub}>Phase 3: Data Longevity & Persistence</Text>

                        {/* Longevity Health Check Card */}
                        <GlassCard style={styles.longevityCard} intensity={25}>
                            <View style={styles.longevityHeader}>
                                <HardDrive size={20} color={stats?.isSafe ? Colors.dark.emerald[400] : Colors.dark.amber[400]} />
                                <Text style={styles.longevityTitle}>Local Archive Health</Text>
                                {stats?.isSafe && (
                                    <View style={styles.safeBadge}>
                                        <Text style={styles.safeBadgeText}>Redundant</Text>
                                    </View>
                                )}
                            </View>

                            <View style={styles.longevityStatsRow}>
                                <View style={styles.statItem}>
                                    <Text style={styles.statValue}>{stats?.totalItems || 0}</Text>
                                    <Text style={styles.statLabel}>Total Moments</Text>
                                </View>
                                <View style={styles.statDivider} />
                                <View style={styles.statItem}>
                                    <Text style={[styles.statValue, { color: stats?.coverage === 1 ? Colors.dark.emerald[400] : 'white' }]}>
                                        {Math.round((stats?.coverage || 0) * 100)}%
                                    </Text>
                                    <Text style={styles.statLabel}>Mirrored</Text>
                                </View>
                            </View>

                            <Text style={styles.longevityHint}>
                                {stats?.isSafe
                                    ? "Your entire 10-year history is mirrored on this device. You can safely switch phones or go offline."
                                    : "Some memories are only in the cloud. We are mirroring them in the background for offline survival."}
                            </Text>

                            <TouchableOpacity
                                style={styles.verifyButton}
                                disabled={isVerifying}
                                onPress={async () => {
                                    setIsVerifying(true);
                                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                                    await triggerMirroring(memories, polaroids, idToken || '');
                                    await loadStats();
                                    setIsVerifying(false);
                                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                                }}
                            >
                                <RefreshCcw size={14} color="white" style={isVerifying ? { opacity: 0.5 } : {}} />
                                <Text style={styles.verifyButtonText}>{isVerifying ? 'Verifying...' : 'Force Archive Sync'}</Text>
                            </TouchableOpacity>
                        </GlassCard>

                        <View style={styles.migrationCard}>
                            <Smartphone size={20} color="rgba(255,255,255,0.4)" />
                            <View style={{ flex: 1 }}>
                                <Text style={styles.migrationTitle}>Migration Assistant</Text>
                                <Text style={styles.migrationSub}>Ready for your next flagship phone</Text>
                            </View>
                            <ChevronRight size={16} color="rgba(255,255,255,0.2)" />
                        </View>

                        <View style={styles.formGroup}>
                            <Text style={styles.label}>Debug API URL</Text>
                            <TextInput
                                style={styles.input}
                                value={debugUrlInput}
                                onChangeText={(text) => {
                                    setDebugUrlInput(text);
                                }}
                                placeholder="https://your-server.com"
                                placeholderTextColor="rgba(255,255,255,0.3)"
                                autoCapitalize="none"
                                autoCorrect={false}
                            />
                            <Text style={styles.hint}>Override EXPO_PUBLIC_API_URL. Leave empty to use default.</Text>
                        </View>

                        <TouchableOpacity
                            style={styles.saveButton}
                            onPress={() => {
                                setDebugApiUrl(debugUrlInput.trim() || null);
                                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                                Alert.alert("API URL Updated", `Base URL set to: ${debugUrlInput.trim() || 'Default'}\n\nPlease restart the app if changes don't take effect immediately.`);
                            }}
                        >
                            <Text style={styles.saveButtonText}>Save & Apply URL</Text>
                        </TouchableOpacity>
                    </Animated.View>
                );
            case 'security':
                return (
                    <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.tabContent}>
                        <Text style={styles.sectionTitle}>Privacy & Security</Text>
                        <Text style={styles.sectionSub}>Protect your private celestial space</Text>

                        <GlassCard style={styles.protectionCard} intensity={15}>
                            <View style={styles.settingRow}>
                                <View style={styles.settingInfo}>
                                    <View style={[styles.iconCircle, { backgroundColor: isAppLockEnabled ? Colors.dark.rose[900] + '22' : 'rgba(255,255,255,0.05)' }]}>
                                        <ShieldCheck size={20} color={isAppLockEnabled ? Colors.dark.rose[400] : 'white'} />
                                    </View>
                                    <View style={{ flex: 1, marginRight: 12 }}>
                                        <View style={styles.badgeRow}>
                                            <Text style={styles.settingLabel}>Biometric App Lock</Text>
                                            {isAppLockEnabled && <View style={styles.activeBadge}><Text style={styles.activeBadgeText}>ACTIVE</Text></View>}
                                        </View>
                                        <Text style={styles.settingSub}>Require FaceID or Fingerprint on every launch</Text>
                                    </View>
                                </View>
                                <Switch
                                    trackColor={{ false: '#333', true: Colors.dark.rose[900] }}
                                    thumbColor={isAppLockEnabled ? Colors.dark.rose[400] : '#f4f3f4'}
                                    value={isAppLockEnabled}
                                    onValueChange={async (val) => {
                                        if (val) {
                                            if (!appPinCode) {
                                                setIsPinModalVisible(true);
                                                return;
                                            }
                                            try {
                                                if (typeof LocalAuthentication.authenticateAsync !== 'function') {
                                                    setAppLockEnabled(true);
                                                    return;
                                                }
                                                const result = await LocalAuthentication.authenticateAsync({
                                                    promptMessage: 'Confirm identity to enable Lock',
                                                });
                                                if (result.success) {
                                                    setAppLockEnabled(true);
                                                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                                                }
                                            } catch (e) {
                                                console.error(e);
                                                setAppLockEnabled(false);
                                            }
                                        } else {
                                            setAppLockEnabled(false);
                                        }
                                    }}
                                />
                            </View>

                            <View style={styles.protectionDivider} />

                            <View style={styles.settingRow}>
                                <View style={styles.settingInfo}>
                                    <View style={[styles.iconCircle, { backgroundColor: appPinCode ? 'rgba(244,114,182,0.18)' : 'rgba(255,255,255,0.05)' }]}>
                                        <Lock size={20} color={appPinCode ? Colors.dark.rose[400] : 'white'} />
                                    </View>
                                    <View style={{ flex: 1, marginRight: 12 }}>
                                        <Text style={styles.settingLabel}>PIN Code</Text>
                                        <Text style={styles.settingSub}>{appPinCode ? 'PIN is configured' : 'Set 4-digit PIN for unlock fallback'}</Text>
                                    </View>
                                </View>
                                <TouchableOpacity style={styles.pinSetBtn} onPress={() => setIsPinModalVisible(true)}>
                                    <Text style={styles.pinSetBtnText}>{appPinCode ? 'UPDATE' : 'SET'}</Text>
                                </TouchableOpacity>
                            </View>

                            <View style={styles.protectionDivider} />

                            <View style={styles.settingRow}>
                                <View style={styles.settingInfo}>
                                    <View style={[styles.iconCircle, { backgroundColor: isBiometricEnabled ? 'rgba(129,140,248,0.18)' : 'rgba(255,255,255,0.05)' }]}>
                                        <ShieldCheck size={20} color={isBiometricEnabled ? Colors.dark.indigo[400] : 'white'} />
                                    </View>
                                    <View style={{ flex: 1, marginRight: 12 }}>
                                        <Text style={styles.settingLabel}>Biometric Unlock</Text>
                                        <Text style={styles.settingSub}>Face/Fingerprint in addition to PIN</Text>
                                    </View>
                                </View>
                                <Switch
                                    trackColor={{ false: '#333', true: Colors.dark.indigo[900] }}
                                    thumbColor={isBiometricEnabled ? Colors.dark.indigo[400] : '#f4f3f4'}
                                    value={isBiometricEnabled}
                                    onValueChange={async (val) => {
                                        if (val) {
                                            try {
                                                const hasHw = await LocalAuthentication.hasHardwareAsync();
                                                const enrolled = await LocalAuthentication.isEnrolledAsync();
                                                if (!hasHw || !enrolled) {
                                                    Alert.alert('Unavailable', 'No biometric hardware or biometric is not enrolled on this device.');
                                                    return;
                                                }
                                                setBiometricEnabled(true);
                                            } catch (e) {
                                                console.error(e);
                                            }
                                        } else {
                                            setBiometricEnabled(false);
                                        }
                                    }}
                                />
                            </View>
                        </GlassCard>

                        <View style={styles.securityHintBox}>
                            <Text style={styles.securityHintText}>
                                Enabling App Lock ensures your memories, letters, and real-time status remain private even if your phone is unlocked.
                            </Text>
                        </View>
                    </Animated.View>
                );
            default:
                return (
                    <View style={styles.tabContent}>
                        <Text style={styles.placeholderText}>Coming Soon</Text>
                    </View>
                );
        }
    };

    const tabs: { id: TabId, label: string, icon: any, color: string }[] = [
        { id: 'profile', label: 'Identity', icon: User, color: Colors.dark.rose[400] },
        { id: 'couple', label: 'Space', icon: Heart, color: Colors.dark.emerald[400] },
        { id: 'atmosphere', label: 'Atmosphere', icon: Camera, color: Colors.dark.indigo[400] },
        { id: 'security', label: 'Security', icon: Shield, color: Colors.dark.amber[400] },
        { id: 'updates', label: 'Archives', icon: Zap, color: '#A855F7' },
    ];

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
        >
            {/* Sticky Header Pill */}
            <Animated.View style={[styles.stickyHeader, { top: insets.top - 4 }, headerPillStyle]}>
                <HeaderPill title="Settings" scrollOffset={scrollOffset} />
            </Animated.View>

            <Animated.ScrollView
                ref={scrollRef}
                onScroll={scrollHandler}
                scrollEventThrottle={16}
                nestedScrollEnabled={true}
                contentContainerStyle={{
                    paddingTop: insets.top + 80,
                    paddingBottom: 100
                }}
            >
                <View style={GlobalStyles.centeredHeader}>
                    <Animated.Text style={[GlobalStyles.centeredTitle, titleAnimatedStyle]}>Settings</Animated.Text>
                    <Animated.Text style={[GlobalStyles.centeredSubtitle, sublineAnimatedStyle]}>Identity · Space · Atmosphere</Animated.Text>
                </View>

                {/* Profile Card Summary */}
                <View style={styles.profileSummaryCard}>
                    <View style={styles.profileSummaryInfo}>
                        <ProfileAvatar
                            url={getPublicStorageUrl(profile?.avatar_url, 'avatars', idToken)}
                            fallbackText={profile?.display_name || 'U'}
                            size={64}
                        />
                        <View>
                            <Text style={styles.summaryName}>{profile?.display_name?.split(' ')[0] || "User"}</Text>
                            <Text style={styles.summarySub}>{profile?.email?.split('@')[0] || "Verified account"}</Text>
                        </View>
                    </View>
                    <TouchableOpacity
                        style={styles.summaryEdit}
                        onPress={() => setActiveTab('profile')}
                    >
                        <Pencil size={18} color="rgba(255,255,255,0.6)" />
                    </TouchableOpacity>
                </View>

                {/* Tab Navigation Vertical */}
                <View style={styles.tabNav}>
                    {tabs.map((tab) => {
                        const isActive = activeTab === tab.id;
                        return (
                            <TouchableOpacity
                                key={tab.id}
                                style={styles.tabItem}
                                onPress={() => {
                                    setActiveTab(tab.id);
                                    setSettingsTargetTab(tab.id);
                                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

                                    // Smoothly scroll to content area
                                    // Delay slightly to allow the content to render if it was unmounted
                                    setTimeout(() => {
                                        scrollRef.current?.scrollTo({ y: 420, animated: true });
                                    }, 50);
                                }}
                            >
                                <View style={styles.tabItemLeft}>
                                    <View style={[
                                        styles.tabIconCircle,
                                        isActive ? { backgroundColor: tab.color + '20', borderColor: tab.color + '40' } : null
                                    ]}>
                                        <tab.icon size={20} color={isActive ? tab.color : 'rgba(255,255,255,0.3)'} />
                                    </View>
                                    <Text style={[
                                        styles.tabLabel,
                                        isActive ? styles.tabLabelActive : null
                                    ]}>{tab.label}</Text>
                                </View>
                                {isActive && <ChevronRight size={16} color="white" />}
                            </TouchableOpacity>
                        );
                    })}
                </View>

                {/* Active Tab Content */}
                <View style={styles.tabRows}>
                    {renderTabContent()}
                </View>

                <TouchableOpacity
                    style={styles.signOutButton}
                    onPress={handleSignOut}
                >
                    <LogOut size={16} color={Colors.dark.rose[400]} />
                    <Text style={styles.signOutText}>Sign Out</Text>
                </TouchableOpacity>
            </Animated.ScrollView>

            <Modal
                visible={isPinModalVisible}
                transparent
                animationType="fade"
                statusBarTranslucent
                onRequestClose={() => setIsPinModalVisible(false)}
            >
                <View style={styles.pinModalOverlay}>
                    <GlassCard style={styles.pinModalCard} intensity={16}>
                        <Text style={styles.pinModalTitle}>Set App Lock PIN</Text>
                        <Text style={styles.pinModalSub}>Use a 4-digit PIN for app unlock fallback.</Text>

                        <TextInput
                            style={styles.pinInput}
                            value={pinInput}
                            onChangeText={(t) => setPinInput(t.replace(/\D/g, '').slice(0, 4))}
                            keyboardType="number-pad"
                            secureTextEntry
                            placeholder="Enter 4-digit PIN"
                            placeholderTextColor="rgba(255,255,255,0.35)"
                            maxLength={4}
                        />
                        <TextInput
                            style={styles.pinInput}
                            value={pinConfirmInput}
                            onChangeText={(t) => setPinConfirmInput(t.replace(/\D/g, '').slice(0, 4))}
                            keyboardType="number-pad"
                            secureTextEntry
                            placeholder="Confirm PIN"
                            placeholderTextColor="rgba(255,255,255,0.35)"
                            maxLength={4}
                        />

                        <View style={styles.pinActions}>
                            <TouchableOpacity
                                style={[styles.pinActionBtn, styles.pinCancelBtn]}
                                onPress={() => {
                                    setIsPinModalVisible(false);
                                    setPinInput('');
                                    setPinConfirmInput('');
                                }}
                            >
                                <Text style={styles.pinCancelText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.pinActionBtn, styles.pinSaveBtn]} onPress={validateAndSavePin}>
                                <Text style={styles.pinSaveText}>Save PIN</Text>
                            </TouchableOpacity>
                        </View>
                    </GlassCard>
                </View>
            </Modal>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: 'transparent',
    },
    stickyHeader: {
        position: 'absolute',
        left: 0,
        right: 0,
        zIndex: 1000,
        pointerEvents: 'box-none',
    },
    standardHeader: GlobalStyles.standardHeader,
    standardTitle: GlobalStyles.standardTitle,
    standardSubtitle: GlobalStyles.standardSubtitle,
    profileSummaryCard: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: 'rgba(255, 255, 255, 0.07)',
        marginHorizontal: Spacing.lg,
        padding: Spacing.lg,
        borderRadius: 40,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        marginBottom: Spacing.xl,
    },
    profileSummaryInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.md,
    },
    summaryName: {
        fontSize: 22,
        color: 'white',
        fontFamily: Typography.serif,
    },
    summarySub: {
        fontSize: 11,
        fontFamily: Typography.sansBold,
        color: Colors.dark.rose[400],
        letterSpacing: 1,
        marginTop: 2,
    },
    summaryEdit: {
        padding: 12,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: Radius.full,
    },
    tabNav: {
        marginBottom: Spacing.xl,
    },
    tabItem: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 18,
        paddingHorizontal: Spacing.xl,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.03)',
    },
    tabItemLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
    },
    tabIconCircle: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    tabLabel: {
        fontSize: 15,
        color: 'rgba(255,255,255,0.4)',
        fontFamily: Typography.serif,
    },
    tabLabelActive: {
        color: 'white',
    },
    tabRows: {
        paddingHorizontal: Spacing.lg,
    },
    tabContent: {
        gap: Spacing.xl,
    },
    avatarSection: {
        alignItems: 'center',
        marginBottom: Spacing.md,
    },
    avatarContainer: {
        position: 'relative',
    },
    avatarEditButton: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        borderRadius: 56,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: 0.8,
    },
    formGroup: {
        gap: 12,
    },
    label: {
        fontSize: 10,
        fontFamily: Typography.serifItalic,
        color: 'rgba(255,255,255,0.4)',
        letterSpacing: 4,
        marginLeft: 4,
    },
    input: {
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        borderRadius: 30,
        height: 56,
        paddingHorizontal: 20,
        color: 'white',
        fontSize: 16,
        fontFamily: Typography.sans,
    },
    hint: {
        fontSize: 10,
        color: 'rgba(255,255,255,0.3)',
        marginLeft: 4,
        fontFamily: Typography.serifItalic,
    },
    codeCard: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: Spacing.lg,
        marginTop: Spacing.md,
    },
    codeText: {
        fontSize: 11,
        color: Colors.dark.rose[400],
        fontFamily: Typography.sansBold,
        letterSpacing: 2,
    },
    copyButton: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: 'rgba(255,255,255,0.03)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    saveButton: {
        backgroundColor: '#171717',
        borderWidth: 1,
        borderColor: '#404040',
        borderRadius: 30,
        height: 56,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: Spacing.lg,
    },
    saveButtonText: {
        color: 'white',
        fontSize: 10,
        fontFamily: Typography.sansBold,
        letterSpacing: 2,
    },
    sectionTitle: {
        fontSize: 24,
        fontFamily: Typography.serif,
        color: 'white',
    },
    sectionSub: {
        fontSize: 11,
        color: 'rgba(255,255,255,0.4)',
        textTransform: 'uppercase',
        fontFamily: Typography.sansBold,
        letterSpacing: 1,
        marginTop: 4,
    },
    bgGrid: {
        flexDirection: 'row',
        gap: 12,
        marginTop: Spacing.md,
    },
    bgOption: {
        flex: 1,
        height: 120,
        borderRadius: Radius.lg,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 2,
        borderColor: 'rgba(255,255,255,0.05)',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    activeBg: {
        borderColor: Colors.dark.rose[500],
        backgroundColor: 'black',
    },
    bgOptionLabel: {
        fontSize: 10,
        fontFamily: Typography.sansBold,
        color: 'white',
        textTransform: 'uppercase',
    },
    bgOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.4)',
    },
    bgOptionOverlayText: {
        position: 'absolute',
        bottom: 12,
        alignSelf: 'center',
        textShadowColor: 'rgba(0,0,0,0.8)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 3,
    },
    settingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: Spacing.lg,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.03)',
    },
    settingInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
        flex: 1,
        minWidth: 0,
    },
    iconCircle: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.05)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    settingLabel: {
        fontSize: 15,
        color: 'white',
        fontFamily: Typography.serif,
    },
    settingSub: {
        fontSize: 9,
        color: 'rgba(255,255,255,0.3)',
        textTransform: 'uppercase',
        fontFamily: Typography.sans,
        letterSpacing: 1,
    },
    filterSection: {
        marginTop: Spacing.md,
        gap: 16,
    },
    filterGrid: {
        flexDirection: 'row',
        gap: 12,
    },
    filterButton: {
        flex: 1,
        aspectRatio: 0.8,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
    },
    activeFilter: {
        borderColor: 'rgba(255,255,255,0.25)',
        backgroundColor: 'rgba(255,255,255,0.12)',
    },
    filterText: {
        fontSize: 8,
        fontFamily: Typography.serifItalic,
        color: 'rgba(255,255,255,0.6)',
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    filterSubText: {
        fontSize: 7,
        fontFamily: Typography.sansBold,
        color: 'rgba(255,255,255,0.25)',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginTop: -4,
    },
    customActions: {
        flexDirection: 'row',
        gap: 12,
        marginTop: Spacing.sm,
        marginBottom: Spacing.sm,
    },
    actionButton: {
        flex: 1,
        flexDirection: 'row',
        height: 48,
        borderRadius: 24,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    deleteButton: {
        borderColor: Colors.dark.rose[900] + '44',
        backgroundColor: Colors.dark.rose[900] + '11',
    },
    actionButtonText: {
        fontSize: 9,
        fontFamily: Typography.sansBold,
        color: 'white',
        letterSpacing: 1,
    },
    signOutButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: 'rgba(244, 63, 94, 0.12)',
        borderColor: 'rgba(244, 63, 94, 0.25)',
        borderWidth: 1,
        borderRadius: 30,
        height: 48,
        marginHorizontal: Spacing.xl,
        marginTop: 60,
    },
    signOutText: {
        color: Colors.dark.rose[400],
        fontSize: 10,
        fontFamily: Typography.sansBold,
        letterSpacing: 2,
    },
    premiumBadge: {
        backgroundColor: Colors.dark.rose[900] + '33',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
        borderWidth: 1,
        borderColor: Colors.dark.rose[900] + '55',
        marginLeft: 8,
    },
    premiumBadgeText: {
        color: Colors.dark.rose[400],
        fontSize: 7,
        fontFamily: Typography.sansBold,
        letterSpacing: 1,
    },
    badgeRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    protectionCard: {
        padding: 4,
        borderRadius: 28,
        marginTop: 8,
        backgroundColor: 'rgba(255,255,255,0.02)',
    },
    protectionDivider: {
        height: 1,
        backgroundColor: 'rgba(255,255,255,0.04)',
        marginHorizontal: 20,
    },
    pinSetBtn: {
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 999,
        backgroundColor: 'rgba(255,255,255,0.08)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.16)',
    },
    pinSetBtnText: {
        color: 'white',
        fontSize: 10,
        fontFamily: Typography.sansBold,
        letterSpacing: 1,
    },
    protectionBenefit: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 14,
        gap: 8,
    },
    protectionBenefitText: {
        color: 'rgba(255,255,255,0.25)',
        fontSize: 9,
        fontFamily: Typography.sansBold,
        letterSpacing: 1,
        textTransform: 'uppercase',
    },
    activeBadge: {
        backgroundColor: Colors.dark.emerald[400] + '22',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
        borderWidth: 1,
        borderColor: Colors.dark.emerald[400] + '55',
        marginLeft: 8,
    },
    activeBadgeText: {
        color: Colors.dark.emerald[400],
        fontSize: 7,
        fontFamily: Typography.sansBold,
    },
    securityHintBox: {
        marginTop: 24,
        paddingHorizontal: 8,
    },
    securityHintText: {
        color: 'rgba(255,255,255,0.35)',
        fontSize: 12,
        fontFamily: Typography.serifItalic,
        lineHeight: 18,
        textAlign: 'center',
    },
    pinModalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.65)',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 20,
    },
    pinModalCard: {
        width: '100%',
        maxWidth: 420,
        borderRadius: 24,
        padding: 20,
        gap: 12,
    },
    pinModalTitle: {
        color: 'white',
        fontSize: 22,
        fontFamily: Typography.serifBold,
    },
    pinModalSub: {
        color: 'rgba(255,255,255,0.5)',
        fontSize: 12,
        fontFamily: Typography.sans,
        marginBottom: 6,
    },
    pinInput: {
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderColor: 'rgba(255,255,255,0.14)',
        borderWidth: 1,
        borderRadius: 16,
        height: 50,
        paddingHorizontal: 16,
        color: 'white',
        fontSize: 18,
        fontFamily: Typography.sansBold,
        letterSpacing: 3,
    },
    pinActions: {
        flexDirection: 'row',
        gap: 10,
        marginTop: 8,
    },
    pinActionBtn: {
        flex: 1,
        height: 46,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
    },
    pinCancelBtn: {
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderColor: 'rgba(255,255,255,0.12)',
    },
    pinSaveBtn: {
        backgroundColor: Colors.dark.rose[900],
        borderColor: Colors.dark.rose[400],
    },
    pinCancelText: {
        color: 'rgba(255,255,255,0.8)',
        fontSize: 13,
        fontFamily: Typography.sansBold,
    },
    pinSaveText: {
        color: 'white',
        fontSize: 13,
        fontFamily: Typography.sansBold,
    },
    placeholderText: {
        color: 'rgba(255,255,255,0.2)',
        textAlign: 'center',
        marginTop: 40,
        fontFamily: Typography.serifItalic,
    },
    longevityCard: {
        padding: Spacing.xl,
        gap: 20,
        borderRadius: 32,
        backgroundColor: 'rgba(255,255,255,0.02)',
    },
    longevityHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    longevityTitle: {
        fontSize: 14,
        color: 'white',
        fontFamily: Typography.serif,
        flex: 1,
    },
    safeBadge: {
        backgroundColor: Colors.dark.emerald[400] + '22',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 4,
        borderWidth: 1,
        borderColor: Colors.dark.emerald[400] + '44',
    },
    safeBadgeText: {
        color: Colors.dark.emerald[400],
        fontSize: 8,
        fontFamily: Typography.sansBold,
        letterSpacing: 1,
    },
    longevityStatsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-around',
        paddingVertical: 12,
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderRadius: 20,
    },
    statItem: {
        alignItems: 'center',
        gap: 4,
    },
    statValue: {
        fontSize: 24,
        color: 'white',
        fontFamily: Typography.sansBold,
    },
    statLabel: {
        fontSize: 8,
        color: 'rgba(255,255,255,0.3)',
        fontFamily: Typography.sansBold,
        letterSpacing: 1,
    },
    statDivider: {
        width: 1,
        height: 30,
        backgroundColor: 'rgba(255,255,255,0.1)',
    },
    longevityHint: {
        fontSize: 11,
        color: 'rgba(255,255,255,0.4)',
        lineHeight: 18,
        fontFamily: Typography.serifItalic,
    },
    verifyButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: '#1a1a1a',
        borderWidth: 1,
        borderColor: '#404040',
        height: 48,
        borderRadius: 24,
    },
    verifyButtonText: {
        color: 'white',
        fontSize: 9,
        fontFamily: Typography.sansBold,
        letterSpacing: 1,
    },
    migrationCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
        padding: 20,
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderRadius: 24,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
    },
    migrationTitle: {
        fontSize: 14,
        color: 'white',
        fontFamily: Typography.sansBold,
    },
    migrationSub: {
        fontSize: 10,
        color: 'rgba(255,255,255,0.4)',
        fontFamily: Typography.serifItalic,
        marginTop: 2,
    }
});

