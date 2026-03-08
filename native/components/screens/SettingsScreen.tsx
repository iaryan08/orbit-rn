import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, TextInput, Switch, Alert } from 'react-native';
import { Colors, Radius, Spacing, Typography } from '../../constants/Theme';
import {
    User, Heart, Camera, Shield, Zap,
    LogOut, Pencil, Check, Copy, ChevronRight,
    Moon, Sparkles, Wind, Layers, Circle,
    Camera as CameraIcon
} from 'lucide-react-native';
import { GlassCard } from '../../components/GlassCard';
import { auth, db } from '../../lib/firebase';
import { signOut } from 'firebase/auth';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { useRouter } from 'expo-router';
import Animated, { useSharedValue, useAnimatedScrollHandler, FadeIn, FadeOut, useAnimatedStyle, interpolate, Extrapolate } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useOrbitStore } from '../../lib/store';
import * as Haptics from 'expo-haptics';
import { HeaderPill } from '../../components/HeaderPill';
import { Image as ExpoImage } from 'expo-image';

type TabId = 'profile' | 'couple' | 'atmosphere' | 'security' | 'updates';

import { getPublicStorageUrl } from '../../lib/storage';
import { ProfileAvatar } from '../../components/ProfileAvatar';

export function SettingsScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();

    // Local scroll tracking
    const scrollOffset = useSharedValue(0);
    const scrollHandler = useAnimatedScrollHandler({
        onScroll: (event) => {
            scrollOffset.value = event.contentOffset.y;
        },
    });

    // Morphing: Title fades and scales (Delayed)
    const titleAnimatedStyle = useAnimatedStyle(() => ({
        opacity: interpolate(scrollOffset.value, [85, 125], [1, 0], Extrapolate.CLAMP),
        transform: [{ scale: interpolate(scrollOffset.value, [85, 125], [1, 0.95], Extrapolate.CLAMP) }]
    }));

    // Morphing: HeaderPill fades and slides (Delayed)
    const headerPillStyle = useAnimatedStyle(() => ({
        opacity: interpolate(scrollOffset.value, [105, 135], [0, 1], Extrapolate.CLAMP),
        transform: [{ translateY: interpolate(scrollOffset.value, [105, 135], [5, 0], Extrapolate.CLAMP) }]
    }));

    const { profile, partnerProfile, couple, idToken, appMode, setAppMode, wallpaperConfig, setWallpaperConfig } = useOrbitStore();
    const [activeTab, setActiveTab] = useState<TabId>('profile');
    const [saving, setSaving] = useState(false);
    const [copied, setCopied] = useState(false);

    // Form states
    const [displayName, setDisplayName] = useState(profile?.display_name || "");
    const [partnerNickname, setPartnerNickname] = useState(profile?.partner_nickname || "");
    const [coupleName, setCoupleName] = useState(couple?.couple_name || "");

    useEffect(() => {
        if (profile) {
            setDisplayName(profile.display_name || "");
            setPartnerNickname(profile.partner_nickname || "");
        }
    }, [profile]);

    useEffect(() => {
        if (couple) {
            setCoupleName(couple.couple_name || "");
        }
    }, [couple]);

    const handleSignOut = async () => {
        Alert.alert("Sign Out", "Are you sure you want to sign out?", [
            { text: "Cancel", style: "cancel" },
            {
                text: "Sign Out",
                style: "destructive",
                onPress: async () => {
                    try {
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
                updated_at: serverTimestamp(),
            });
            Alert.alert("Success", "Profile updated successfully");
        } catch (e) {
            console.error(e);
        } finally {
            setSaving(false);
        }
    };

    const handleWallpaperChange = async (mode: 'stars' | 'custom' | 'shared') => {
        if (!profile?.id) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        // Optimistic UI Update
        setWallpaperConfig({ mode });

        try {
            await updateDoc(doc(db, 'users', profile.id), {
                wallpaper_mode: mode,
                updated_at: serverTimestamp(),
            });
        } catch (e) {
            console.error(e);
        }
    };

    const handleGrayscaleToggle = async (val: boolean) => {
        if (!profile?.id) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        // Optimistic UI Update
        setWallpaperConfig({ grayscale: val });

        try {
            await updateDoc(doc(db, 'users', profile.id), {
                wallpaper_grayscale: val,
                updated_at: serverTimestamp(),
            });
        } catch (e) {
            console.error(e);
        }
    };

    const handleFilterChange = async (filter: 'Natural' | 'Glass' | 'Tint' | 'Pro') => {
        if (!profile?.id) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        // Optimistic UI Update
        setWallpaperConfig({ filter });

        try {
            await updateDoc(doc(db, 'users', profile.id), {
                wallpaper_filter: filter,
                updated_at: serverTimestamp(),
            });
        } catch (e) {
            console.error(e);
        }
    };

    const copyPairCode = () => {
        if (couple?.couple_code) {
            setCopied(true);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const renderTabContent = () => {
        switch (activeTab) {
            case 'profile':
                return (
                    <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.tabContent}>
                        <View style={styles.avatarSection}>
                            <View style={styles.avatarContainer}>
                                <ProfileAvatar
                                    url={getPublicStorageUrl(profile?.avatar_url, 'avatars')}
                                    fallbackText={profile?.display_name || 'U'}
                                    size={112}
                                >
                                    <TouchableOpacity style={styles.avatarEditButton}>
                                        <CameraIcon size={20} color="white" />
                                    </TouchableOpacity>
                                </ProfileAvatar>
                            </View>
                        </View>

                        <View style={styles.formGroup}>
                            <Text style={styles.label}>DISPLAY NAME</Text>
                            <TextInput
                                style={styles.input}
                                value={displayName}
                                onChangeText={setDisplayName}
                                placeholderTextColor="rgba(255,255,255,0.3)"
                            />
                        </View>

                        <TouchableOpacity
                            style={styles.saveButton}
                            onPress={handleSaveProfile}
                            disabled={saving}
                        >
                            <Text style={styles.saveButtonText}>{saving ? 'SAVING...' : 'SAVE IDENTITY'}</Text>
                        </TouchableOpacity>
                    </Animated.View>
                );
            case 'couple':
                return (
                    <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.tabContent}>
                        <View style={styles.formGroup}>
                            <Text style={styles.label}>PARTNER NICKNAME</Text>
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
                            <Text style={styles.label}>SPACE NAME</Text>
                            <TextInput
                                style={styles.input}
                                value={coupleName}
                                onChangeText={setCoupleName}
                                placeholderTextColor="rgba(255,255,255,0.3)"
                            />
                        </View>

                        <GlassCard style={styles.codeCard}>
                            <View>
                                <Text style={styles.label}>CONNECTION CODE</Text>
                                <Text style={styles.codeText}>{couple?.couple_code || '---'}</Text>
                            </View>
                            <TouchableOpacity onPress={copyPairCode} style={styles.copyButton}>
                                {copied ? <Check size={20} color={Colors.dark.emerald[400]} /> : <Copy size={20} color="white" />}
                            </TouchableOpacity>
                        </GlassCard>
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
                                        source={{ uri: getPublicStorageUrl(profile.custom_wallpaper_url, 'avatars', idToken) || undefined }}
                                        style={StyleSheet.absoluteFillObject}
                                        contentFit="cover"
                                        transition={200}
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
                            <TouchableOpacity
                                style={[styles.bgOption, wallpaperConfig.mode === 'shared' && styles.activeBg, { overflow: 'hidden', padding: 0 }, !partnerProfile?.custom_wallpaper_url && { opacity: 0.5 }]}
                                onPress={() => handleWallpaperChange('shared')}
                                disabled={!partnerProfile?.custom_wallpaper_url}
                            >
                                {partnerProfile?.custom_wallpaper_url ? (
                                    <ExpoImage
                                        source={{ uri: getPublicStorageUrl(partnerProfile.custom_wallpaper_url, 'avatars', idToken) || undefined }}
                                        style={StyleSheet.absoluteFillObject}
                                        contentFit="cover"
                                        transition={200}
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

                        <View style={styles.settingRow}>
                            <View style={styles.settingInfo}>
                                <View style={styles.iconCircle}>
                                    <Moon size={20} color={Colors.dark.rose[400]} />
                                </View>
                                <View>
                                    <Text style={styles.settingLabel}>Monochrome Mode</Text>
                                    <Text style={styles.settingSub}>Classic black & white vibe</Text>
                                </View>
                            </View>
                            <Switch
                                trackColor={{ false: '#333', true: Colors.dark.rose[900] }}
                                thumbColor={wallpaperConfig.grayscale ? Colors.dark.rose[400] : '#f4f3f4'}
                                value={wallpaperConfig.grayscale}
                                onValueChange={handleGrayscaleToggle}
                            />
                        </View>

                        {/* Lunara Mode Toggle */}
                        <View style={styles.settingRow}>
                            <View style={styles.settingInfo}>
                                <View style={[styles.iconCircle, { backgroundColor: 'rgba(168, 85, 247, 0.15)' }]}>
                                    <Moon size={20} color="#a855f7" />
                                </View>
                                <View>
                                    <Text style={styles.settingLabel}>Lunara Mode</Text>
                                    <Text style={styles.settingSub}>Cycle & rhythm tracking theme</Text>
                                </View>
                            </View>
                            <Switch
                                trackColor={{ false: '#333', true: 'rgba(168,85,247,0.5)' }}
                                thumbColor={appMode === 'lunara' ? '#a855f7' : '#f4f3f4'}
                                value={appMode === 'lunara'}
                                onValueChange={(val) => {
                                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                                    setAppMode(val ? 'lunara' : 'moon');
                                }}
                            />
                        </View>

                        <View style={styles.filterSection}>
                            <Text style={styles.label}>AESTHETIC FILTERING</Text>
                            <View style={styles.filterGrid}>
                                {[
                                    { key: 'Natural', icon: Circle, color: Colors.dark.emerald[400] },
                                    { key: 'Glass', icon: Wind, color: Colors.dark.indigo[400] },
                                    { key: 'Tint', icon: Layers, color: Colors.dark.rose[400] },
                                    { key: 'Pro', icon: Sparkles, color: Colors.dark.amber[400] },
                                ].map((item) => (
                                    <TouchableOpacity
                                        key={item.key}
                                        style={[styles.filterButton, wallpaperConfig.filter === item.key && styles.activeFilter]}
                                        onPress={() => handleFilterChange(item.key as any)}
                                    >
                                        <item.icon size={20} color={wallpaperConfig.filter === item.key ? item.color : 'rgba(255,255,255,0.4)'} />
                                        <Text style={[styles.filterText, wallpaperConfig.filter === item.key && { color: 'white' }]}>{item.key}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
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
        { id: 'profile', label: 'Personal Information', icon: User, color: Colors.dark.rose[400] },
        { id: 'couple', label: 'Space & Connection', icon: Heart, color: Colors.dark.emerald[400] },
        { id: 'atmosphere', label: 'Atmosphere', icon: Camera, color: Colors.dark.indigo[400] },
        { id: 'security', label: 'Privacy & Security', icon: Shield, color: Colors.dark.amber[400] },
        { id: 'updates', label: 'App & Data', icon: Zap, color: '#A855F7' },
    ];

    return (
        <View style={styles.container}>
            {/* Sticky Header Pill */}
            <Animated.View style={[styles.stickyHeader, { top: insets.top - 4 }, headerPillStyle]}>
                <HeaderPill title="Settings" scrollOffset={scrollOffset} />
            </Animated.View>

            <Animated.ScrollView
                onScroll={scrollHandler}
                scrollEventThrottle={16}
                contentContainerStyle={{
                    paddingTop: insets.top + Spacing.lg,
                    paddingBottom: 160
                }}
            >
                <Animated.Text style={[styles.headerTitle, titleAnimatedStyle]}>Settings</Animated.Text>

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
                                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
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
                    <Text style={styles.signOutText}>SIGN OUT</Text>
                </TouchableOpacity>
            </Animated.ScrollView>
        </View>
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
    headerTitle: {
        fontSize: 48,
        fontFamily: Typography.serif,
        color: Colors.dark.foreground,
        letterSpacing: -1,
        paddingHorizontal: Spacing.xl,
        marginTop: 100, // Standardized for smooth morph
        marginBottom: Spacing.sm,
    },
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
        fontWeight: 'bold',
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
        fontFamily: Typography.serif,
        fontStyle: 'italic',
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
    },
    hint: {
        fontSize: 10,
        color: 'rgba(255,255,255,0.3)',
        marginLeft: 4,
        fontStyle: 'italic',
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
        fontWeight: '900',
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
        fontWeight: 'bold',
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
        fontStyle: 'italic',
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
        borderRadius: 24,
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    activeFilter: {
        borderColor: 'rgba(255,255,255,0.2)',
        backgroundColor: 'rgba(255,255,255,0.08)',
    },
    filterText: {
        fontSize: 8,
        fontFamily: Typography.serif,
        fontStyle: 'italic',
        color: 'rgba(255,255,255,0.6)',
        textTransform: 'uppercase',
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
        fontWeight: '900',
        letterSpacing: 2,
    },
    placeholderText: {
        color: 'rgba(255,255,255,0.2)',
        textAlign: 'center',
        marginTop: 40,
        fontFamily: Typography.serif,
        fontStyle: 'italic',
    }
});
