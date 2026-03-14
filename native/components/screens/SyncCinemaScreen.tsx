import React, { useCallback, useEffect, useRef, useState } from 'react';
import { TouchableOpacity, View, Text, StyleSheet, Dimensions, Platform, Alert, Modal, TextInput, KeyboardAvoidingView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming, withSequence, runOnJS, withDelay, withRepeat, Easing, interpolate, cancelAnimation } from 'react-native-reanimated';
import { ANIM_FADE_IN, ANIM_FADE_OUT, ANIM_MICRO } from '../../constants/Animation';

import { getPartnerName } from '../../lib/utils';
import { useOrbitStore } from '../../lib/store';
import { getPublicStorageUrl } from '../../lib/storage';
import { rtdb } from '../../lib/firebase';
import { ref, update, set, onDisconnect, onValue, serverTimestamp } from 'firebase/database';
import { repository } from '../../lib/repository';
import * as Haptics from 'expo-haptics';
import { Film, X, Plus, Sparkles as SparklesIcon, Music, Search, Play, Pause, SkipForward, SkipBack, Heart, Trash2, ListMusic } from 'lucide-react-native';
import { Image } from 'expo-image';
import { Emoji } from '../Emoji';
import { useVideoPlayer, VideoView } from 'expo-video';
import { ScrollView, ActivityIndicator } from 'react-native';

import { Canvas, Blur, ColorMatrix, Group, Paint, Circle, Fill } from '@shopify/react-native-skia';
import { Colors, Radius, Spacing, Typography } from '../../constants/Theme';
import { GlobalStyles } from '../../constants/Styles';
import { GlassCard } from '../GlassCard';
import { PerfChip, usePerfMonitor } from '../PerfChip';

import { MarqueeText } from '../cinema/MarqueeText';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

type ReactionType = 'laugh' | 'heartbeat' | 'tap' | 'emoji-preset';

const BASE_EMOJIS = ['💗', '🥺', '😘', '🍿'];


export function SyncCinemaScreen({ isActive = true }: { isActive?: boolean }) {
    const profile = useOrbitStore(s => s.profile);
    const couple = useOrbitStore(s => s.couple);
    const isCurrentTab = useOrbitStore(s => s.activeTabIndex === 0);
    const isFocused = isCurrentTab && isActive;
    const partnerProfile = useOrbitStore(s => s.partnerProfile);
    const idToken = useOrbitStore(s => s.idToken);
    const insets = useSafeAreaInsets();
    const perfStats = usePerfMonitor('SyncCinema');
    const isDebugMode = useOrbitStore(state => state.isDebugMode);

    const [partnerInCinema, setPartnerInCinema] = useState(false);
    const [partnerOnline, setPartnerOnline] = useState(false);
    const [incomingReaction, setIncomingReaction] = useState<{ type: ReactionType; emoji?: string; senderName?: string; senderId?: string } | null>(null);
    const [selectedEmoji, setSelectedEmoji] = useState(BASE_EMOJIS[0]);
    const [sessionEmojis, setSessionEmojis] = useState(BASE_EMOJIS);
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);

    const isMountedRef = useRef(true);
    const lastProcessedBroadcastRef = useRef<Record<string, number>>({});
    const partnerName = getPartnerName(profile, partnerProfile);

    const partnerAvatarUrl = React.useMemo(() =>
        getPublicStorageUrl(partnerProfile?.avatar_url, 'avatars', idToken),
        [partnerProfile?.avatar_url, idToken]);

    const reactionScale = useSharedValue(0);
    const reactionOpacity = useSharedValue(0);
    const reactionTranslateY = useSharedValue(0);
    const reactionRotate = useSharedValue(0);
    const energyPulse = useSharedValue(1);

    // Music State
    const [showMusicSearch, setShowMusicSearch] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [isLoadingMusic, setIsLoadingMusic] = useState(false);
    const [currentSong, setCurrentSong] = useState<any>(null);
    const [showFullPlayer, setShowFullPlayer] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);

    // VITAL PERFORMANCE: Shared Values for high-frequency ticker updates (prevents re-renders)
    const progressShared = useSharedValue(0);
    const durationShared = useSharedValue(1);
    const [playbackPosition, setPlaybackPosition] = useState(0); // Kept for infrequent UI sync if needed, but rarely used now
    const [playbackDuration, setPlaybackDuration] = useState(0);

    // Dynamic UI Shared Values
    const miniPlayerTranslateX = useSharedValue(0);
    const trayShiftY = useSharedValue(0);
    const isSeeking = useSharedValue(false);
    const seekProgressValue = useSharedValue(0);
    const miniPlayerOpacity = useSharedValue(1);
    const trayTranslationY = useSharedValue(150);
    const trayOpacity = useSharedValue(0);
    const instructionsOpacity = useSharedValue(0);

    const progressFillStyle = useAnimatedStyle(() => ({
        width: `${(isSeeking.value ? seekProgressValue.value : (progressShared.value / (durationShared.value || 1))) * 100}%`
    }));

    const thumbStyle = useAnimatedStyle(() => ({
        left: `${(isSeeking.value ? seekProgressValue.value : (progressShared.value / (durationShared.value || 1))) * 100}%`,
        opacity: withTiming(isSeeking.value ? 1 : 0.6, { duration: 150 }),
        transform: [{ scale: isSeeking.value ? 1.5 : 1 }]
    }));
    const [musicTab, setMusicTab] = useState<'search' | 'queue' | 'tape'>('search');
    const [sharedQueue, setSharedQueue] = useState<any[]>([]);
    const [sharedTape, setSharedTape] = useState<any[]>([]);
    const [backgroundEnabled, setBackgroundEnabled] = useState(true);

    const player = useVideoPlayer(null, (p) => {
        p.loop = true;
        p.staysActiveInBackground = true;
        // Disable by default to avoid binder race conditions on boot
        p.showNowPlayingNotification = false;
    });

    const [hasBeenFocused, setHasBeenFocused] = useState(false);
    const currentSongRef = useRef<any>(null);
    const lastActiveTrackSignatureRef = useRef<string | null>(null);
    const searchAbortRef = useRef<AbortController | null>(null);
    const searchRequestIdRef = useRef(0);

    useEffect(() => {
        if (isFocused && !hasBeenFocused) {
            setHasBeenFocused(true);
        }
    }, [isFocused]);

    useEffect(() => {
        player.staysActiveInBackground = backgroundEnabled;
        if (backgroundEnabled && currentSongRef.current) {
            player.showNowPlayingNotification = true;
        } else if (!backgroundEnabled && !player.playing) {
            player.showNowPlayingNotification = false;
        }
    }, [backgroundEnabled, player]);

    useEffect(() => {
        if (!isFocused && player.playing && !backgroundEnabled) {
            player.pause();
            setIsPlaying(false);
        }
    }, [backgroundEnabled, isFocused, player]);

    const sharedQueueRef = useRef<any[]>([]);
    const sharedTapeRef = useRef<any[]>([]);
    useEffect(() => { currentSongRef.current = currentSong; }, [currentSong]);
    useEffect(() => { sharedQueueRef.current = sharedQueue; }, [sharedQueue]);
    useEffect(() => { sharedTapeRef.current = sharedTape; }, [sharedTape]);

    useEffect(() => {
        if (!couple?.id) return;

        const restoreState = async () => {
            const saved = await repository.getMusicState(couple.id);
            if (saved && !currentSong && hasBeenFocused) {
                console.log("[Music] Restoring state from SQLite:", saved.current_track?.name);
                setCurrentSong(saved.current_track);
                setSharedQueue(saved.queue || []);
                setSharedTape(saved.playlist || []);

                if (saved.current_track?.downloadUrl) {
                    const url = saved.current_track.downloadUrl[saved.current_track.downloadUrl.length - 1]?.url;
                    if (url) {
                        try {
                            player.replace({ uri: url });
                            player.currentTime = (saved.progress_ms || 0) / 1000;
                            if (saved.is_playing) {
                                // Enable notification only when actually starting playback
                                player.showNowPlayingNotification = true;
                                player.play();
                                setIsPlaying(true);
                            }
                        } catch (e) {
                            console.error("[Music] Error restoring player source:", e);
                        }
                    }
                }
            }
        };
        restoreState();
    }, [couple?.id, hasBeenFocused]);

    // Optimized Local Persistence (Debounced)
    const lastLocalSave = useRef(0);
    useEffect(() => {
        if (!couple?.id || !currentSong || !isFocused) return;

        const saveToLocal = () => {
            const now = Date.now();
            if (now - lastLocalSave.current < 2000) return; // Debounce 2s

            repository.saveMusicState(couple.id, {
                current_track: currentSong,
                queue: sharedQueue,
                playlist: sharedTape,
                is_playing: player.playing,
                progress_ms: player.currentTime * 1000,
            });
            lastLocalSave.current = now;
        };

        const interval = setInterval(saveToLocal, 5000);
        return () => clearInterval(interval);
    }, [couple?.id, currentSong, isPlaying, sharedQueue, sharedTape]);

    useEffect(() => {
        trayShiftY.value = withTiming(currentSong ? -75 : 0, { duration: 400 });
    }, [currentSong]);

    // ðŸ›¡ï¸ REMOVED redundant interval to prevent CPU spikes / heating
    // useEffect(() => {
    //     const interval = setInterval(() => {
    //         if (player.playing && !isSeeking.value) {
    //             runOnJS(setPlaybackPosition)(player.currentTime);
    //             runOnJS(setPlaybackDuration)(player.duration);
    //         }
    //     }, 500);
    //     return () => clearInterval(interval);
    // }, [player]);

    const broadcastMusicAction = (action: 'play' | 'pause') => {
        if (!couple?.id || !profile?.id) return;

        // 1. Optimistic Local Save
        repository.saveMusicState(couple.id, { is_playing: action === 'play', progress_ms: player.currentTime * 1000 });

        // 2. Clear literal: Don't waste RTDB if partner isn't connected
        if (!partnerInCinema) return;

        const broadcastRef = ref(rtdb, `broadcasts/${couple.id}/${profile.id}`);
        set(broadcastRef, {
            event: 'music_control',
            timestamp: Date.now(),
            payload: { action, senderId: profile.id }
        });

        // Also sync the global session state
        update(ref(rtdb, `couples/${couple.id}/music/active_track`), {
            isPlaying: action === 'play',
            timestamp: Date.now()
        });
    };

    const broadcastSong = (song: any) => {
        if (!couple?.id || !profile?.id || !partnerInCinema) return;
        const broadcastRef = ref(rtdb, `broadcasts/${couple.id}/${profile.id}`);
        const cleanSong = JSON.parse(JSON.stringify(song));
        set(broadcastRef, {
            event: 'music_event',
            timestamp: Date.now(),
            payload: { song: cleanSong, senderId: profile.id, position: player.currentTime }
        });
    };

    const broadcastSeek = (position: number) => {
        if (!couple?.id || !profile?.id || !partnerInCinema) return;
        const broadcastRef = ref(rtdb, `broadcasts/${couple.id}/${profile.id}`);
        set(broadcastRef, {
            event: 'music_seek',
            timestamp: Date.now(),
            payload: { position, senderId: profile.id }
        });

        // Update persistence
        update(ref(rtdb, `couples/${couple.id}/music/active_track`), {
            position,
            timestamp: Date.now()
        });
    };


    const addToQueue = (song: any) => {
        if (!couple?.id) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

        const entry = {
            id: String(song.id),
            name: song.name,
            artists: song.artists,
            image: song.image,
            downloadUrl: song.downloadUrl
        };

        setSharedQueue(prev => {
            if (prev.some(s => String(s.id) === entry.id)) return prev;
            const updated = [...prev, entry].slice(-25);

            // 1. Save to SQLite always
            repository.saveMusicState(couple.id, { queue: updated });

            // Keep shared queue durable even if partner is not currently in cinema.
            const cleanData = JSON.parse(JSON.stringify(updated));
            set(ref(rtdb, `couples/${couple.id}/music/queue`), cleanData);
            return updated;
        });
    };

    const removeFromQueue = (songId: string) => {
        if (!couple?.id) return;
        setSharedQueue(prev => {
            const updated = prev.filter(s => String(s.id) !== String(songId));

            // 1. Save locally
            repository.saveMusicState(couple.id, { queue: updated });

            set(ref(rtdb, `couples/${couple.id}/music/queue`), updated);
            return updated;
        });
    };

    const addToTape = (song: any) => {
        if (!couple?.id) return;
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        const entry = {
            id: String(song.id),
            name: song.name,
            artists: song.artists,
            image: song.image,
            downloadUrl: song.downloadUrl
        };

        setSharedTape(prev => {
            const listWithoutCurrent = prev.filter(s => String(s.id) !== entry.id);
            const updated = [entry, ...listWithoutCurrent].slice(0, 50);

            // 1. Save locally
            repository.saveMusicState(couple.id, { playlist: updated });

            const cleanData = JSON.parse(JSON.stringify(updated));
            set(ref(rtdb, `couples/${couple.id}/music/tape`), cleanData);
            return updated;
        });
    };

    const removeFromTape = (songId: string) => {
        if (!couple?.id) return;
        setSharedTape(prev => {
            const updated = prev.filter(s => String(s.id) !== String(songId));

            // 1. Save locally
            repository.saveMusicState(couple.id, { playlist: updated });

            set(ref(rtdb, `couples/${couple.id}/music/tape`), updated);
            return updated;
        });
    };

    const nextSong = () => {
        if (sharedQueueRef.current.length > 0) {
            const song = sharedQueueRef.current[0];
            removeFromQueue(song.id);
            selectSong(song);
        } else {
            // Shake the player if empty
            miniPlayerTranslateX.value = withSequence(
                withTiming(-10, { duration: 50 }),
                withTiming(10, { duration: 50 }),
                withTiming(0, { duration: 50 })
            );
        }
    };

    const prevSong = () => {
        // Simple logic for now: restart current or do nothing if no history
        player.currentTime = 0;
    };

    const handleSearch = useCallback(async (rawQuery?: string) => {
        const queryText = (rawQuery ? rawQuery : searchQuery).trim();
        if (!queryText) {
            searchAbortRef.current?.abort();
            setSearchResults([]);
            setIsLoadingMusic(false);
            return;
        }

        const requestId = ++searchRequestIdRef.current;
        searchAbortRef.current?.abort();
        const controller = new AbortController();
        searchAbortRef.current = controller;
        setIsLoadingMusic(true);
        const API_URLS = [
            `https://saavn.sumit.co/api/search/songs?query=${encodeURIComponent(queryText)}`,
            `https://jiosaavn-api-beta.vercel.app/api/search/songs?query=${encodeURIComponent(queryText)}`
        ];

        let lastError = null;
        for (const url of API_URLS) {
            try {
                const res = await fetch(url, { method: 'GET', headers: { 'Accept': 'application/json' }, signal: controller.signal });
                if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
                const json = await res.json();
                const results = json.data?.results || json.data || [];
                if (results.length > 0) {
                    if (requestId === searchRequestIdRef.current) {
                        setSearchResults(results);
                        setIsLoadingMusic(false);
                    }
                    return;
                }
            } catch (error) {
                if ((error as any)?.name === 'AbortError') return;
                console.error(`Search failed with ${url}:`, error);
                lastError = error;
            }
        }

        if (requestId === searchRequestIdRef.current) {
            setSearchResults([]);
            setIsLoadingMusic(false);
        }
        if (lastError && requestId === searchRequestIdRef.current) {
            Alert.alert("VOID ERROR", "COULD NOT PIERCE THE MUSIC STREAM. TRY ANOTHER QUERY.");
        }
    }, [searchQuery]);

    useEffect(() => {
        if (!showMusicSearch || musicTab !== 'search') return;
        const trimmed = searchQuery.trim();
        if (!trimmed) {
            searchAbortRef.current?.abort();
            setSearchResults([]);
            setIsLoadingMusic(false);
            return;
        }
        const timer = setTimeout(() => {
            void handleSearch(trimmed);
        }, 260);
        return () => clearTimeout(timer);
    }, [handleSearch, musicTab, searchQuery, showMusicSearch]);

    const selectSong = (song: any) => {
        const url = song.downloadUrl?.[song.downloadUrl.length - 1]?.url;

        if (!url) {
            Alert.alert("VOID WARNING", "STREAM NOT FOUND FOR THIS TRACK.");
            return;
        }

        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

        // Clean song for persistence
        const entry = {
            id: String(song.id),
            name: song.name,
            artists: song.artists,
            image: song.image,
            downloadUrl: song.downloadUrl
        };

        // Save at couple level so it persists even if one partner leaves
        if (couple?.id) {
            // 1. Save to local SQLite always
            repository.saveMusicState(couple.id, { current_track: entry, is_playing: true, progress_ms: 0 });

            const cleanSong = JSON.parse(JSON.stringify(entry));
            set(ref(rtdb, `couples/${couple.id}/music/active_track`), {
                song: cleanSong,
                senderId: profile?.id,
                isPlaying: true,
                position: 0,
                timestamp: Date.now()
            });
        }

        setCurrentSong(entry);
        setPlaybackDuration(0);
        player.showNowPlayingNotification = true;
        player.replace({ uri: url });
        player.play();
        broadcastSong(entry);
        setShowMusicSearch(false);
    };

    // Energy Breathing loop
    useEffect(() => {
        if (isFocused) {
            energyPulse.value = withRepeat(
                withTiming(1.15, { duration: 3000, easing: Easing.inOut(Easing.quad) }),
                -1,
                true
            );
        } else {
            cancelAnimation(energyPulse);
            energyPulse.value = 1;
        }
    }, [isFocused]);

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    const lastBroadcastAt = useRef(0);


    const safeSetIncomingReaction = useCallback((value: any) => {
        if (!isMountedRef.current) return;
        setIncomingReaction(value);
    }, []);

    // Presence & Broadcast logic — Restored for pure light communication
    useEffect(() => {
        if (!couple?.id || !profile?.id) return;

        const presenceRef = ref(rtdb, `presence/${couple.id}/${profile.id}`);
        const broadcastRef = ref(rtdb, `broadcasts/${couple.id}/${profile.id}`);

        const updatePresence = () => {
            // is_online is global for the app (active session)
            // in_cinema is EXCLUSIVE to this screen being focused
            update(presenceRef, {
                in_cinema: isFocused ? true : null,
                is_online: true,
                last_changed: serverTimestamp()
            });
        };

        updatePresence();
        const heartbeat = setInterval(updatePresence, 60000);

        // onDisconnect strictly handles app closure/crash
        onDisconnect(presenceRef).update({
            in_cinema: null,
            is_online: false,
            last_changed: serverTimestamp()
        });
        onDisconnect(broadcastRef).remove();

        return () => {
            clearInterval(heartbeat);
            // When leaving this screen, we explicitly clear in_cinema but keep is_online: true
            update(presenceRef, { in_cinema: null, last_changed: serverTimestamp() }).catch(() => { });
        };
    }, [isFocused, couple?.id, profile?.id]);

    useEffect(() => {
        if (!isFocused) return;
        const offsetRef = ref(rtdb, '.info/serverTimeOffset');
        const unsubOffset = onValue(offsetRef, (snap) => {
            const nextOffset = typeof snap.val() === 'number' ? snap.val() : 0;
            serverOffsetRef.current = nextOffset;
        });
        return () => unsubOffset();
    }, [isFocused]);

    const serverOffsetRef = useRef(0);

    useEffect(() => {
        if (!couple?.id || !profile?.id || !isFocused) return;
        const presenceRef = ref(rtdb, `presence/${couple.id}`);
        let lastPresenceData: any = null;

        const validatePresence = () => {
            if (!lastPresenceData) {
                setPartnerInCinema(false);
                setPartnerOnline(false);
                return;
            }
            const now = Date.now() + serverOffsetRef.current;
            const isMarkedOnline = !!lastPresenceData.is_online || !!lastPresenceData.in_cinema;
            const lastChanged = typeof lastPresenceData.last_changed === 'number'
                ? lastPresenceData.last_changed
                : (isMarkedOnline ? now : 0);
            // Best-in-Class: 5 minute buffer + Server Offset Correction
            // Robust check against local clock drift
            const diff = Math.abs(now - lastChanged);
            const isFresh = diff < 300_000;

            setPartnerOnline(isFresh && !!lastPresenceData.is_online);
            setPartnerInCinema(isFresh && !!lastPresenceData.in_cinema);
        };

        const unsubPresence = onValue(presenceRef, (snap) => {
            const allPresence = snap.val() || {};
            const partnerEntry = Object.entries(allPresence).find(([userId]) => userId !== profile.id);
            lastPresenceData = partnerEntry?.[1] || null;
            validatePresence();
        });

        const presenceValidator = setInterval(validatePresence, 30000);

        return () => {
            unsubPresence();
            clearInterval(presenceValidator);
        };
    }, [isFocused, couple?.id, profile?.id]);

    // 1. Transient Broadcasts (Seeks, Reactions, Heartbeats)
    // High frequency — only listen if partner is actually online
    useEffect(() => {
        if (!couple?.id || !profile?.id || !isFocused) return;

        const broadcastRef = ref(rtdb, `broadcasts/${couple.id}`);
        const unsubBroadcasts = onValue(broadcastRef, (snap) => {
            const allData = snap.val() || {};

            Object.entries(allData).forEach(([senderId, data]: [string, any]) => {
                if (senderId === profile.id || !data?.event) return;

                const timestamp = Number(data?.timestamp || 0);
                if (timestamp <= (lastProcessedBroadcastRef.current[senderId] || 0)) return;
                lastProcessedBroadcastRef.current[senderId] = timestamp;

                if (data.event === 'cinema_event' && (Date.now() - timestamp < 10000)) {
                    // Check for nested web-style payload or native-style
                    const payload = data.payload?.event ? data.payload : data.payload;
                    handleIncomingEvent(payload);
                } else if (data.event === 'music_event' && (Date.now() - timestamp < 15000)) {
                    handleMusicSync(data.payload);
                } else if (data.event === 'music_control' && (Date.now() - timestamp < 5000)) {
                    handleMusicControl(data.payload);
                } else if (data.event === 'music_seek' && (Date.now() - timestamp < 5000)) {
                    handleMusicSeek(data.payload);
                }
            });
        });

        return () => unsubBroadcasts();
    }, [isFocused, couple?.id, profile?.id]);

    // Shared Space Listeners (Queue, Tape, & Active Track)
    useEffect(() => {
        if (!couple?.id || !isFocused) return;

        // Shared spaces (Queue/Tape) should sync regardless of partner online status
        // so that users can edit playlists and tape while waiting for partner.

        const queueRef = ref(rtdb, `couples/${couple.id}/music/queue`);
        const tapeRef = ref(rtdb, `couples/${couple.id}/music/tape`);
        const activeTrackRef = ref(rtdb, `couples/${couple.id}/music/active_track`);

        const unsubQueue = onValue(queueRef, (snap) => {
            const nextQueue = snap.val() || [];
            setSharedQueue((prev) => JSON.stringify(prev) === JSON.stringify(nextQueue) ? prev : nextQueue);
        });
        const unsubTape = onValue(tapeRef, (snap) => {
            const nextTape = snap.val() || [];
            setSharedTape((prev) => JSON.stringify(prev) === JSON.stringify(nextTape) ? prev : nextTape);
        });

        const unsubActive = onValue(activeTrackRef, (snap) => {
            const data = snap.val();
            if (data?.song) {
                const songId = String(data.song.id);
                const signature = `${songId}:${data.senderId || ''}:${Math.round(Number(data.position || 0))}:${data.isPlaying ? 1 : 0}`;
                if (signature === lastActiveTrackSignatureRef.current) return;
                lastActiveTrackSignatureRef.current = signature;

                const currentSongId = currentSongRef.current?.id ? String(currentSongRef.current.id) : null;
                const isExternalChange = data.senderId !== profile?.id;
                const isNewSong = currentSongId !== songId;

                if (isNewSong) {
                    setCurrentSong(data.song);
                    const url = data.song.downloadUrl?.[data.song.downloadUrl.length - 1]?.url;
                    if (url) {
                        player.showNowPlayingNotification = true;
                        player.replace({ uri: url });
                        if (data.position) player.currentTime = data.position;
                        if (data.isPlaying) player.play();
                        setIsPlaying(!!data.isPlaying);
                    }
                } else if (isExternalChange) {
                    // Sync play/pause/seek for the same song
                    if (data.isPlaying !== undefined && data.isPlaying !== player.playing) {
                        data.isPlaying ? player.play() : player.pause();
                        setIsPlaying(data.isPlaying);
                    }
                    if (data.position !== undefined && Math.abs(data.position - player.currentTime) > 2) {
                        player.currentTime = data.position;
                    }
                }
            }
        });

        return () => {
            unsubQueue();
            unsubTape();
            unsubActive();
        };
    }, [couple?.id, isFocused, partnerOnline, player, profile?.id]);

    const handleIncomingEvent = (event: any) => {
        if (!event || event.senderId === profile?.id) return;
        const type = event.type || 'tap';

        setIncomingReaction({
            type,
            emoji: event.emoji || (type === 'heartbeat' ? '💗' : type === 'laugh' ? '😂' : '✨'),
            senderId: event.senderId,
            senderName: partnerName
        });

        reactionScale.value = 0;
        reactionOpacity.value = withDelay(2000, withTiming(0, { duration: 600 }, (finished) => {
            if (finished) runOnJS(safeSetIncomingReaction)(null);
        }));

        // Emoji Animation Drift
        reactionTranslateY.value = withSequence(
            withTiming(-40, { duration: 400, easing: Easing.out(Easing.back(1.5)) }),
            withTiming(-60, { duration: 2000, easing: Easing.linear })
        );
        reactionRotate.value = withTiming(Math.random() > 0.5 ? 15 : -15, { duration: 2400 });

        Haptics.impactAsync(type === 'heartbeat' ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Light);
    };

    const handleMusicSync = (payload: any) => {
        if (!payload.song || payload.senderId === profile?.id) return;
        setCurrentSong(payload.song);
        setPlaybackDuration(0); // Reset duration for synced song
        const url = payload.song.downloadUrl?.[payload.song.downloadUrl.length - 1]?.url;
        if (url) {
            player.showNowPlayingNotification = true;
            player.replace({ uri: url });
            if (payload.position) {
                player.currentTime = payload.position;
            }
            player.play();
            setIsPlaying(true);
        }
    };

    const handleMusicSeek = (payload: any) => {
        if (payload.senderId === profile?.id) return;
        player.currentTime = payload.position;
    };

    const handleMusicControl = (payload: any) => {
        if (payload.senderId === profile?.id) return;
        if (payload.action === 'play') {
            player.play();
            setIsPlaying(true);
        } else if (payload.action === 'pause') {
            player.pause();
            setIsPlaying(false);
        }
    };

    const togglePlay = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        if (player.playing) {
            player.pause();
            setIsPlaying(false);
            broadcastMusicAction('pause');
        } else {
            player.showNowPlayingNotification = true;
            player.play();
            setIsPlaying(true);
            broadcastMusicAction('play');
        }
    };

    const handleSeek = (position: number) => {
        if (!player.duration) return;
        const bounded = Math.max(0, Math.min(position, player.duration));
        player.currentTime = bounded;
        setPlaybackPosition(bounded);
        broadcastSeek(bounded);
    };

    const handleAction = (type: ReactionType, emoji?: string) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

        setIncomingReaction({
            type,
            emoji,
            senderId: profile?.id,
            senderName: profile?.display_name
        });

        reactionScale.value = 0;
        reactionScale.value = withSequence(withTiming(1.5, { duration: 250 }), withTiming(1, { duration: 150 }));
        reactionOpacity.value = withDelay(2000, withTiming(0, { duration: 600 }, (f) => f && runOnJS(safeSetIncomingReaction)(null)));

        reactionTranslateY.value = withSequence(
            withTiming(-40, { duration: 400, easing: Easing.out(Easing.back(1.5)) }),
            withTiming(-60, { duration: 2000, easing: Easing.linear })
        );
        reactionRotate.value = withTiming(Math.random() > 0.5 ? 10 : -10, { duration: 2400 });

        const now = Date.now();
        if (couple?.id && profile?.id && (now - lastBroadcastAt.current > 1000)) {
            lastBroadcastAt.current = now;
            const broadcastRef = ref(rtdb, `broadcasts/${couple.id}/${profile.id}`);
            set(broadcastRef, {
                event: 'cinema_event',
                timestamp: now,
                payload: {
                    event: 'reaction', // WEBALIGN: Vital for cross-platform sync
                    type,
                    emoji: emoji || (type === 'heartbeat' ? '💗' : type === 'laugh' ? '😂' : '✨'),
                    senderId: profile?.id || 'unknown',
                    senderName: profile?.display_name || 'Partner'
                }
            }).catch(() => { });
        }
        instructionsOpacity.value = 0;
    };

    const composed = Gesture.Exclusive(
        Gesture.LongPress().minDuration(250).onStart(() => {
            runOnJS(handleAction)('heartbeat');
        }),
        Gesture.Pan().activeOffsetY([-10, 10]).onEnd((e) => {
            if (e.translationY < -50) runOnJS(handleAction)('laugh');
            else if (e.translationY > 50) runOnJS(handleAction)('tap', '😢');
        }),
        Gesture.Tap().numberOfTaps(2).onEnd(() => runOnJS(handleAction)('tap', '✨')),
        Gesture.Tap().onEnd(() => runOnJS(handleAction)('tap', selectedEmoji))
    );

    const animatedInstructionsStyle = useAnimatedStyle(() => ({
        opacity: instructionsOpacity.value,
        transform: [{ translateY: interpolate(instructionsOpacity.value, [0, 1], [10, 0]) }]
    }));

    const animatedTrayStyle = useAnimatedStyle(() => ({
        transform: [
            { translateY: trayTranslationY.value },
            { translateY: trayShiftY.value }
        ],
        opacity: trayOpacity.value,
    }));

    useEffect(() => {
        if (isFocused) {
            trayTranslationY.value = withDelay(100, withTiming(0, ANIM_MICRO));
            trayOpacity.value = withDelay(100, withTiming(1, ANIM_MICRO));
            instructionsOpacity.value = withSequence(withTiming(0.5, { duration: 1000 }), withDelay(3000, withTiming(0, { duration: 1000 })));
        } else {
            trayTranslationY.value = 150; trayOpacity.value = 0;
            // Aggressive resource cleanup on blur if background play is disabled
            // Added tick delay to avoid binder conflicts during fast navigation
            if (!backgroundEnabled && isMountedRef.current) {
                setTimeout(() => {
                    if (!isFocused && isMountedRef.current) {
                        player.pause();
                        setIsPlaying(false);
                    }
                }, 100);
            }
        }
    }, [isFocused, backgroundEnabled]);

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    };


    useEffect(() => {
        const timeSub = player.addListener('timeUpdate', (event) => {
            // Force status to playing if time is moving
            if (event.currentTime > 0 && !isPlaying && player.playing) {
                setIsPlaying(true);
            }

            // High-frequency Shared Value update (UI thread only)
            progressShared.value = event.currentTime;
            if (player.duration > 0) {
                durationShared.value = player.duration;
            }

            // Infrequent React state sync for text/background cleanup (every 2 seconds)
            if (Math.floor(event.currentTime) % 2 === 0 && Math.abs(event.currentTime - lastPlaybackPosition.current) > 1) {
                setPlaybackPosition(event.currentTime);
                lastPlaybackPosition.current = event.currentTime;
            }

            // Auto-play next in queue
            if (player.duration > 0 && event.currentTime >= player.duration - 0.8) {
                if (sharedQueueRef.current.length > 0) {
                    const nextSong = sharedQueueRef.current[0];
                    removeFromQueue(nextSong.id);
                    selectSong(nextSong);
                }
            }
        });

        const statusSub = player.addListener('playingChange', (event) => {
            setIsPlaying(event.isPlaying);
            if (!event.isPlaying) {
                setPlaybackPosition(player.currentTime);
            }
        });

        const metaSub = player.addListener('statusChange', () => {
            if (player.duration > 0) {
                durationShared.value = player.duration;
                setPlaybackDuration(player.duration);
            }
        });

        return () => {
            timeSub.remove();
            statusSub.remove();
            metaSub.remove();
        };
    }, [player]);

    const lastPlaybackPosition = useRef(0);



    return (
        <View style={styles.container}>
            {isFocused && (
                <>
                    {/* Hidden Player Engine - 10px anchor to keep Android thread priority high */}
                    <VideoView player={player} style={{ width: 10, height: 10, opacity: 0.01, position: 'absolute', top: -100 }} />

                    {/* The Infinite Void - Assertive Pure Black */}
                    <View style={[StyleSheet.absoluteFill, { backgroundColor: 'black' }]} />

                    <GestureDetector gesture={composed}>
                        <View style={StyleSheet.absoluteFill} />
                    </GestureDetector>



                    {/* Music Icon Toggle */}
                    <TouchableOpacity
                        testID="music-search-toggle"
                        style={[styles.musicToggle, { top: insets.top + 24 }]}
                        onPress={() => setShowMusicSearch(true)}
                    >
                        <Music color="white" size={20} />
                    </TouchableOpacity>

                    {/* Sync Status HUD - Positioned at Top */}
                    <View style={[styles.partnerInfo, { top: insets.top + 10 }]}>
                        {partnerAvatarUrl ? (
                            <Image source={{ uri: partnerAvatarUrl }} style={styles.avatar} alt="partner avatar" />
                        ) : (
                            <View style={[styles.avatar, styles.avatarPlaceholder]}>
                            </View>
                        )}
                        <View style={{ marginLeft: 12 }}>
                            <Text style={styles.presenceText}>{partnerName.toUpperCase()}</Text>
                            <Text style={[
                                styles.watchingAloneText,
                                partnerInCinema ? { color: '#10b981' } : (partnerOnline ? { color: '#fbbf24' } : null)
                            ]}>
                                {partnerInCinema ? 'LINKED IN VOID' : (partnerOnline ? 'ACTIVE NOW' : 'OFF-GRID')}
                            </Text>
                            {currentSong && isPlaying && (
                                <TouchableOpacity
                                    onPress={() => {
                                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                        setBackgroundEnabled(!backgroundEnabled);
                                    }}
                                    activeOpacity={0.7}
                                    style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, maxWidth: SCREEN_WIDTH * 0.55 }}
                                >
                                    <Music color={backgroundEnabled ? "#a855f7" : "rgba(255,255,255,0.4)"} size={8} />
                                    <Text style={[styles.listeningText, { marginLeft: 4, color: backgroundEnabled ? '#a855f7' : 'rgba(255,255,255,0.3)' }]} numberOfLines={1}>
                                        {currentSong.name.replace(/&quot;/g, '"').replace(/&amp;/g, '&').toUpperCase()}
                                    </Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    </View>

                    {/* Instructions */}
                    <Animated.View style={[styles.instructionsContainer, animatedInstructionsStyle]} pointerEvents="none">
                        <Text style={styles.instructionText}>PURE SYNC ACTIVE</Text>
                    </Animated.View>

                    {/* Reaction Layer */}
                    {incomingReaction && (
                        <Animated.View style={[styles.reactionOverlay, { transform: [{ scale: reactionScale.value }], opacity: reactionOpacity.value }]} pointerEvents="none">
                            <Animated.Text style={[styles.reactionEmoji, { transform: [{ translateY: reactionTranslateY.value }, { rotateZ: `${reactionRotate.value}deg` }] }]}>
                                {incomingReaction?.emoji || (incomingReaction?.type === 'heartbeat' ? '❤️' : incomingReaction?.type === 'laugh' ? '😂' : '✨')}
                            </Animated.Text>
                            <Animated.View style={{ opacity: interpolate(reactionOpacity.value, [0.8, 1], [0, 1]) }}>
                                <Text style={styles.reactionSenderText}>{incomingReaction.senderName}</Text>
                            </Animated.View>
                        </Animated.View>
                    )}

                    {/* Emoji Tray & Customizer */}
                    <Animated.View style={[styles.trayContainer, { bottom: insets.bottom + 20, opacity: trayOpacity.value, transform: [{ translateY: trayShiftY.value }] }]} pointerEvents="box-none">
                        <View style={[styles.emojiTray, { borderColor: partnerInCinema ? 'rgba(16, 185, 129, 0.3)' : 'rgba(255, 255, 255, 0.1)' }]}>
                            {sessionEmojis.map((emoji, index) => (
                                <TouchableOpacity
                                    key={index}
                                    style={[styles.emojiBtn, selectedEmoji === emoji && { backgroundColor: 'rgba(255,255,255,0.1)' }]}
                                    onPress={() => {
                                        setSelectedEmoji(emoji);
                                        handleAction('tap', emoji);
                                    }}
                                    onLongPress={() => {
                                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                                        setShowEmojiPicker(true);
                                    }}
                                >
                                    <Text style={{ fontSize: 24 }}>{emoji}</Text>
                                </TouchableOpacity>
                            ))}
                            <View style={{ width: 1, height: 20, backgroundColor: 'rgba(255,255,255,0.1)', alignSelf: 'center', marginHorizontal: 4 }} />
                            <TouchableOpacity
                                style={styles.emojiBtn}
                                onPress={() => setShowEmojiPicker(true)}
                            >
                                <Plus size={20} color="rgba(255,255,255,0.6)" />
                            </TouchableOpacity>
                        </View>
                    </Animated.View>

                    {/* Session Emoji Picker Modal */}
                    <Modal
                        visible={showEmojiPicker}
                        transparent
                        animationType="fade"
                        onRequestClose={() => setShowEmojiPicker(false)}
                    >
                        <View style={styles.modalOverlay}>
                            <GlassCard style={styles.emojiPickerCard} intensity={20}>
                                <Text style={styles.emojiPickerTitle}>SESSION EMOJIS</Text>
                                <Text style={styles.emojiPickerSub}>PICK UP TO 3 ADD-ONS (TOTAL 7 MAX)</Text>

                                <View style={styles.emojiGrid}>
                                    {['💍', '🥺', '😊', '❤️', '🔥', '✨', '🌊', '🌙', '🫂', '💋', '💅', '🫦', '🧸', '🌹', '🥂'].map((emoji) => {
                                        const isSelected = sessionEmojis.includes(emoji);
                                        return (
                                            <TouchableOpacity
                                                key={emoji}
                                                style={[styles.gridEmojiBtn, isSelected && styles.gridEmojiBtnSelected]}
                                                onPress={() => {
                                                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                                    if (isSelected) {
                                                        setSessionEmojis(prev => prev.filter(e => e !== emoji));
                                                    } else if (sessionEmojis.length < 3) {
                                                        setSessionEmojis(prev => [...prev, emoji]);
                                                    }
                                                }}
                                            >
                                                <Text style={{ fontSize: 32 }}>{emoji}</Text>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>

                                <TouchableOpacity
                                    style={styles.closePickerBtn}
                                    onPress={() => {
                                        if (sessionEmojis.length > 0) {
                                            setSelectedEmoji(sessionEmojis[0]);
                                        }
                                        setShowEmojiPicker(false);
                                    }}
                                >
                                    <Text style={styles.closePickerText}>DONE</Text>
                                </TouchableOpacity>
                            </GlassCard>
                        </View>
                    </Modal>

                    {/* Spotify-style Mini Player — Pro Swipe & Seek */}
                    {currentSong && !showMusicSearch && (
                        <View style={[styles.miniPlayerContainer, { bottom: insets.bottom + 20 }]}>
                            <GestureDetector gesture={Gesture.Pan()
                                .activeOffsetX([-10, 10])
                                .onUpdate((e) => {
                                    miniPlayerTranslateX.value = e.translationX;
                                })
                                .onEnd((e) => {
                                    if (e.velocityX < -500 || e.translationX < -80) {
                                        miniPlayerTranslateX.value = withTiming(-SCREEN_WIDTH, { duration: 200 }, () => {
                                            runOnJS(nextSong)();
                                            miniPlayerTranslateX.value = SCREEN_WIDTH;
                                            miniPlayerTranslateX.value = withTiming(0, { duration: 200 });
                                        });
                                    } else if (e.velocityX > 500 || e.translationX > 80) {
                                        miniPlayerTranslateX.value = withTiming(SCREEN_WIDTH, { duration: 200 }, () => {
                                            runOnJS(prevSong)();
                                            miniPlayerTranslateX.value = -SCREEN_WIDTH;
                                            miniPlayerTranslateX.value = withTiming(0, { duration: 200 });
                                        });
                                    } else {
                                        miniPlayerTranslateX.value = withTiming(0);
                                    }
                                })}>
                                <View style={styles.miniPlayer}>
                                    <Animated.View style={[{ flex: 1, flexDirection: 'row', alignItems: 'center' }, { transform: [{ translateX: miniPlayerTranslateX.value }] }]}>
                                        <Image source={{ uri: currentSong.image?.[0]?.url }} style={styles.miniArt} alt="album art" />
                                        <View style={styles.miniInfo}>
                                            <View style={{ justifyContent: 'center', height: 28 }}>
                                                <MarqueeText
                                                    text={currentSong.name.replace(/&quot;/g, '"').replace(/&amp;/g, '&')}
                                                    style={styles.miniTitle}
                                                    isActive={isFocused}
                                                />
                                                <Text style={styles.miniArtist} numberOfLines={1}>{currentSong.artists?.primary?.[0]?.name}</Text>
                                            </View>
                                        </View>

                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginRight: 8 }}>
                                            {isPlaying && (
                                                <TouchableOpacity
                                                    onPress={() => {
                                                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                                        setBackgroundEnabled(!backgroundEnabled);
                                                    }}
                                                    hitSlop={{ top: 20, bottom: 20, left: 10, right: 10 }}
                                                >
                                                    <Music color={backgroundEnabled ? "#a855f7" : "rgba(255,255,255,0.4)"} size={12} />
                                                </TouchableOpacity>
                                            )}
                                            <TouchableOpacity
                                                testID="music-play-pause"
                                                onPress={togglePlay}
                                                style={styles.miniPlayBtnCompact}
                                                hitSlop={{ top: 20, bottom: 20, left: 10, right: 10 }}
                                            >
                                                {isPlaying ? <Pause color="white" size={26} fill="white" /> : <Play color="white" size={26} fill="white" />}
                                            </TouchableOpacity>
                                        </View>
                                    </Animated.View>

                                    {/* Pro Slidable Progress Bar (Pan & Tap) */}
                                    <GestureDetector gesture={Gesture.Race(
                                        Gesture.Pan()
                                            .onBegin((e) => {
                                                isSeeking.value = true;
                                                seekProgressValue.value = Math.max(0, Math.min(1, e.x / (SCREEN_WIDTH - 24)));
                                            })
                                            .onUpdate((e) => {
                                                seekProgressValue.value = Math.max(0, Math.min(1, e.x / (SCREEN_WIDTH - 24)));
                                            })
                                            .onEnd(() => {
                                                runOnJS(handleSeek)(seekProgressValue.value * player.duration);
                                                isSeeking.value = false;
                                            }),
                                        Gesture.Tap().onEnd((e) => {
                                            runOnJS(handleSeek)((e.x / (SCREEN_WIDTH - 24)) * player.duration);
                                        })
                                    )}>
                                        <View style={styles.miniProgressContainer}>
                                            <Animated.View style={[styles.miniProgressFill, progressFillStyle]} />
                                            <Animated.View style={[styles.miniThumb, thumbStyle]} />
                                        </View>
                                    </GestureDetector>
                                </View>
                            </GestureDetector>
                        </View>
                    )}

                    {/* Music Search Modal */}
                    <Modal visible={showMusicSearch} animationType="slide" transparent>
                        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(8, 8, 10, 0.98)' }]}>
                            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
                                <View style={[styles.modalHeader, { paddingTop: insets.top + 20 }]}>
                                    <TouchableOpacity onPress={() => setShowMusicSearch(false)} style={styles.closeModal}>
                                        <X color="white" size={24} />
                                    </TouchableOpacity>
                                    <TextInput
                                        style={styles.searchInput}
                                        placeholder="Search Music..."
                                        placeholderTextColor="rgba(255,255,255,0.4)"
                                        value={searchQuery}
                                        onChangeText={setSearchQuery}
                                        onSubmitEditing={() => { void handleSearch(); }}
                                        autoFocus
                                    />
                                </View>

                                <View style={{ flex: 1, paddingHorizontal: 20 }}>
                                    {/* Tab Switcher */}
                                    <View style={styles.musicTabs}>
                                        <TouchableOpacity onPress={() => setMusicTab('search')} style={[styles.musicTab, musicTab === 'search' && styles.musicTabActive]}>
                                            <Search size={14} color={musicTab === 'search' ? 'white' : 'rgba(255,255,255,0.4)'} />
                                            <Text style={[styles.musicTabText, musicTab === 'search' && styles.musicTabTextActive]}>VOICE</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity onPress={() => setMusicTab('queue')} style={[styles.musicTab, musicTab === 'queue' && styles.musicTabActive]}>
                                            <ListMusic size={14} color={musicTab === 'queue' ? 'white' : 'rgba(255,255,255,0.4)'} />
                                            <Text style={[styles.musicTabText, musicTab === 'queue' && styles.musicTabTextActive]}>QUEUE ({sharedQueue.length})</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity onPress={() => setMusicTab('tape')} style={[styles.musicTab, musicTab === 'tape' && styles.musicTabActive]}>
                                            <Heart size={14} color={musicTab === 'tape' ? 'white' : 'rgba(255,255,255,0.4)'} />
                                            <Text style={[styles.musicTabText, musicTab === 'tape' && styles.musicTabTextActive]}>TAPE ({sharedTape.length})</Text>
                                        </TouchableOpacity>
                                    </View>

                                    {isLoadingMusic ? (
                                        <View style={styles.loaderContainer}>
                                            <ActivityIndicator color="#a855f7" />
                                            <Text style={styles.loadingText}>PIERCING THE VOID...</Text>
                                        </View>
                                    ) : (
                                        <ScrollView
                                            contentContainerStyle={{ gap: 12, marginTop: 10, paddingBottom: insets.bottom + 40 }}
                                            showsVerticalScrollIndicator={false}
                                        >
                                            {musicTab === 'search' && (
                                                <>
                                                    {searchResults.length === 0 && searchQuery && !isLoadingMusic && (
                                                        <Text style={styles.noResultsText}>NO SOUNDS FOUND IN THE VOID</Text>
                                                    )}
                                                    {searchResults.map((song) => (
                                                        <TouchableOpacity
                                                            key={song.id}
                                                            style={styles.searchItem}
                                                            onPress={() => selectSong(song)}
                                                        >
                                                            <Image source={{ uri: song.image?.[0]?.url }} style={styles.searchArt} alt="song art" />
                                                            <View style={{ flex: 1 }}>
                                                                <Text style={styles.searchTitle} numberOfLines={1}>{song.name}</Text>
                                                                <Text style={styles.searchArtist} numberOfLines={1}>{song.artists?.primary?.[0]?.name}</Text>
                                                            </View>
                                                            <View style={styles.songActions}>
                                                                <TouchableOpacity
                                                                    style={styles.songActionBtn}
                                                                    onPress={(e) => { e.stopPropagation(); addToQueue(song); }}
                                                                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                                                >
                                                                    <Plus size={16} color="white" />
                                                                </TouchableOpacity>
                                                                <TouchableOpacity
                                                                    style={styles.songActionBtn}
                                                                    onPress={(e) => { e.stopPropagation(); addToTape(song); }}
                                                                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                                                >
                                                                    <Heart
                                                                        size={16}
                                                                        color="white"
                                                                        fill={sharedTape.some(s => String(s.id) === String(song.id)) ? "white" : "transparent"}
                                                                    />
                                                                </TouchableOpacity>
                                                            </View>
                                                        </TouchableOpacity>
                                                    ))}
                                                </>
                                            )}

                                            {musicTab === 'queue' && (
                                                <>
                                                    {sharedQueue.length === 0 && (
                                                        <Text style={styles.noResultsText}>THE QUEUE IS EMPTY</Text>
                                                    )}
                                                    {sharedQueue.map((song) => (
                                                        <TouchableOpacity
                                                            key={song.id}
                                                            style={styles.searchItem}
                                                            onPress={() => selectSong(song)}
                                                        >
                                                            <Image source={{ uri: song.image?.[0]?.url }} style={styles.searchArt} alt="song art" />
                                                            <View style={{ flex: 1 }}>
                                                                <Text style={styles.searchTitle} numberOfLines={1}>{song.name}</Text>
                                                                <Text style={styles.searchArtist} numberOfLines={1}>{song.artists?.primary?.[0]?.name}</Text>
                                                            </View>
                                                            <TouchableOpacity
                                                                style={styles.songActionBtn}
                                                                onPress={(e) => { e.stopPropagation(); removeFromQueue(song.id); }}
                                                            >
                                                                <Trash2 size={16} color="#ef4444" />
                                                            </TouchableOpacity>
                                                        </TouchableOpacity>
                                                    ))}
                                                </>
                                            )}

                                            {musicTab === 'tape' && (
                                                <>
                                                    {sharedTape.length === 0 && (
                                                        <Text style={styles.noResultsText}>NO SONGS RECORDED ON TAPE</Text>
                                                    )}
                                                    {sharedTape.map((song) => (
                                                        <TouchableOpacity
                                                            key={song.id}
                                                            style={styles.searchItem}
                                                            onPress={() => selectSong(song)}
                                                        >
                                                            <Image source={{ uri: song.image?.[0]?.url }} style={styles.searchArt} alt="song art" />
                                                            <View style={{ flex: 1 }}>
                                                                <Text style={styles.searchTitle} numberOfLines={1}>{song.name}</Text>
                                                                <Text style={styles.searchArtist} numberOfLines={1}>{song.artists?.primary?.[0]?.name}</Text>
                                                            </View>
                                                            <TouchableOpacity
                                                                style={styles.songActionBtn}
                                                                onPress={(e) => { e.stopPropagation(); removeFromTape(song.id); }}
                                                            >
                                                                <Trash2 size={16} color="#ef4444" />
                                                            </TouchableOpacity>
                                                        </TouchableOpacity>
                                                    ))}
                                                </>
                                            )}
                                        </ScrollView>
                                    )}
                                </View>
                            </KeyboardAvoidingView>
                        </View>
                    </Modal>
                </>
            )}
            {isDebugMode && (
                <View style={{ position: 'absolute', top: insets.top + (Platform.OS === 'ios' ? 4 : 8), right: 16, zIndex: 10001 }}>
                    <PerfChip name="SyncCinema" stats={perfStats} />
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
    partnerInfo: {
        position: 'absolute',
        left: 20,
        flexDirection: 'row',
        alignItems: 'center',
    },
    avatar: {
        width: 44,
        height: 44,
        borderRadius: 22,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.15)',
    },
    avatarPlaceholder: {
        backgroundColor: 'rgba(255,255,255,0.05)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    avatarText: {
        color: 'white',
        fontWeight: 'bold',
        fontSize: 16,
    },
    presenceText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '900',
        letterSpacing: 1.5,
    },
    watchingAloneText: {
        color: 'rgba(255,255,255,0.55)',
        fontSize: 13,
        fontWeight: '700',
        letterSpacing: 1,
        marginTop: 2,
    },
    listeningText: {
        color: '#a855f7',
        fontSize: 12,
        fontWeight: '900',
        letterSpacing: 1,
        marginTop: 2,
    },
    instructionsContainer: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
    },
    instructionText: {
        color: '#fff',
        fontSize: 12,
        fontWeight: '900',
        letterSpacing: 1.5,
    },
    subInstructionText: {
        color: 'rgba(255,255,255,0.65)',
        fontSize: 14,
        fontWeight: '900',
        letterSpacing: 3,
        textAlign: 'center',
    },
    reactionOverlay: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
    },
    reactionEmoji: {
        fontSize: 100,
        fontWeight: '900',
        fontFamily: Platform.OS === 'ios' ? 'Apple Color Emoji' : undefined,
    },
    reactionSenderText: {
        color: 'rgba(255,255,255,0.75)',
        fontSize: 12,
        fontWeight: '900',
        letterSpacing: 4,
        marginTop: 20,
    },
    trayContainer: {
        position: 'absolute',
        left: 0,
        right: 0,
        alignItems: 'center',
    },
    emojiTray: {
        flexDirection: 'row',
        backgroundColor: 'rgba(15,15,15,0.85)',
        borderRadius: 24,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    emojiBtn: {
        marginHorizontal: 10,
        width: 36,
        height: 36,
        alignItems: 'center',
        justifyContent: 'center',
    },
    musicToggle: {
        position: 'absolute',
        right: 20,
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(255,255,255,0.1)',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.45)',
    },
    miniPlayerContainer: {
        position: 'absolute',
        left: 12,
        right: 12,
        zIndex: 100,
    },
    miniPlayer: {
        height: 64, // More compact
        backgroundColor: 'rgba(25,25,25,0.98)',
        borderRadius: 12,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        overflow: 'hidden',
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.5,
        shadowRadius: 15,
        elevation: 10,
    },
    miniArt: {
        width: 44,
        height: 44,
        borderRadius: 4,
    },
    miniInfo: {
        flex: 1,
        marginLeft: 14,
        justifyContent: 'center',
    },
    miniTitle: {
        color: 'white',
        fontSize: 14,
        fontWeight: '800',
        lineHeight: 14,
        includeFontPadding: false,
        paddingBottom: 0,
    },
    miniArtist: {
        color: 'rgba(255,255,255,0.65)',
        fontSize: 14,
        fontWeight: '600',
        marginTop: -2,
        includeFontPadding: false,
    },
    miniPlayBtnCompact: {
        padding: 4,
    },
    miniProgressContainer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 6,
        backgroundColor: 'rgba(255,255,255,0.05)',
        justifyContent: 'center',
    },
    miniProgressFill: {
        height: '100%',
        backgroundColor: '#a855f7',
    },
    miniThumb: {
        position: 'absolute',
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: 'white',
        marginLeft: -4,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.5,
        shadowRadius: 2,
        elevation: 3,
    },
    modalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        gap: 12,
    },
    closeModal: {
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
    },
    searchInput: {
        flex: 1,
        height: 44,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: 22,
        paddingHorizontal: 20,
        color: 'white',
        fontSize: 14,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    loadingText: {
        color: 'rgba(255,255,255,0.65)',
        fontSize: 14,
        fontWeight: '900',
        letterSpacing: 3,
        textAlign: 'center',
        marginTop: 12,
    },
    loaderContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    noResultsText: {
        color: 'rgba(255,255,255,0.45)',
        fontSize: 14,
        fontWeight: '900',
        textAlign: 'center',
        marginTop: 40,
        letterSpacing: 1.5,
    },
    searchItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 10,
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderRadius: 14,
        gap: 12,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
    },
    searchArt: {
        width: 44,
        height: 44,
        borderRadius: 6,
    },
    searchTitle: {
        color: 'white',
        fontSize: 18,
        fontWeight: '700',
    },
    searchArtist: {
        color: 'rgba(255,255,255,0.65)',
        fontSize: 11,
    },
    fullArtContainer: {
        width: SCREEN_WIDTH - 60,
        height: SCREEN_WIDTH - 60,
        borderRadius: 24,
        backgroundColor: 'rgba(255,255,255,0.05)',
        alignSelf: 'center',
        marginBottom: 40,
        overflow: 'hidden',
        elevation: 20,
        shadowColor: 'black',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.5,
        shadowRadius: 20,
    },
    fullArt: {
        width: '100%',
        height: '100%',
    },
    fullTitle: {
        color: 'white',
        fontSize: 12,
        fontWeight: '900',
        marginBottom: 8,
        textAlign: 'center',
        lineHeight: 34,
    },
    fullArtist: {
        color: 'rgba(255,255,255,0.82)',
        fontSize: 18,
        fontWeight: '600',
        marginBottom: 40,
        textAlign: 'center',
    },
    progressContainer: {
        width: '100%',
        marginBottom: 40,
    },
    progressBar: {
        height: 6,
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 3,
        width: '100%',
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        backgroundColor: '#a855f7',
    },
    timeRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 10,
    },
    timeText: {
        color: 'rgba(255,255,255,0.65)',
        fontSize: 12,
        fontWeight: '700',
    },
    fullControls: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 50,
    },
    mainPlayBtn: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: 'white',
        justifyContent: 'center',
        alignItems: 'center',
    },
    musicTabs: {
        flexDirection: 'row',
        paddingHorizontal: 20,
        marginVertical: 15,
        gap: 8,
    },
    musicTab: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.05)',
        gap: 6,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    musicTabActive: {
        backgroundColor: 'rgba(168, 85, 247, 0.2)',
        borderColor: '#a855f7',
    },
    musicTabText: {
        color: 'rgba(255,255,255,0.65)',
        fontSize: 14,
        fontWeight: '900',
        letterSpacing: 1,
    },
    musicTabTextActive: {
        color: 'white',
    },
    songActions: {
        flexDirection: 'row',
        gap: 8,
    },
    songActionBtn: {
        width: 32,
        height: 32,
        borderRadius: 10,
        backgroundColor: 'rgba(255,255,255,0.08)',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    upNextContainer: {
        marginTop: 40,
        backgroundColor: 'rgba(255,255,255,0.05)',
        padding: 16,
        borderRadius: 20,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
    },
    upNextLabel: {
        color: '#a855f7',
        fontSize: 14,
        fontWeight: '900',
        letterSpacing: 1.5,
        marginBottom: 6,
    },
    upNextTitle: {
        color: 'white',
        fontSize: 14,
        fontWeight: '700',
    },
    bgToggle: {
        position: 'absolute',
        top: 100,
        alignSelf: 'center',
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 12,
        backgroundColor: 'rgba(168, 85, 247, 0.1)',
        borderWidth: 1,
        borderColor: 'rgba(168, 85, 247, 0.3)',
        gap: 6,
    },
    bgToggleDisabled: {
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderColor: 'rgba(255,255,255,0.1)',
    },
    bgToggleText: {
        color: '#a855f7',
        fontSize: 14,
        fontWeight: '900',
        letterSpacing: 1,
    },
    bgToggleDisabledText: {
        color: 'rgba(255,255,255,0.65)',
    },
    cinemaHeader: {
        position: 'absolute',
        top: 60,
        left: 0,
        right: 0,
        alignItems: 'center',
        zIndex: 10,
    },
    cinemaTitle: {
        fontSize: 32,
        fontFamily: Typography.serif,
        color: 'white',
        letterSpacing: 8,
        textTransform: 'uppercase',
        opacity: 0.5,
    },
    cinemaSubtitle: {
        fontSize: 14,
        fontFamily: Typography.sansBold,
        color: 'rgba(168, 85, 247, 0.5)',
        letterSpacing: 4,
        marginTop: 4,
    },
    standardHeader: GlobalStyles.standardHeader,
    standardTitle: GlobalStyles.standardTitle,
    standardSubtitle: GlobalStyles.standardSubtitle,
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.8)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    emojiPickerCard: {
        width: '100%',
        maxWidth: 340,
        padding: 24,
        borderRadius: 32,
        alignItems: 'center',
    },
    emojiPickerTitle: {
        fontSize: 20,
        fontFamily: Typography.serif,
        color: 'white',
        letterSpacing: 4,
        marginBottom: 4,
    },
    emojiPickerSub: {
        fontSize: 10,
        fontFamily: Typography.sansBold,
        color: 'rgba(255,255,255,0.4)',
        letterSpacing: 1.5,
        marginBottom: 24,
    },
    emojiGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: 12,
        marginBottom: 32,
    },
    gridEmojiBtn: {
        width: 60,
        height: 60,
        borderRadius: 16,
        backgroundColor: 'rgba(255,255,255,0.05)',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
    },
    gridEmojiBtnSelected: {
        backgroundColor: 'rgba(168, 85, 247, 0.2)',
        borderColor: '#a855f7',
    },
    closePickerBtn: {
        width: '100%',
        height: 54,
        borderRadius: 16,
        backgroundColor: 'white',
        justifyContent: 'center',
        alignItems: 'center',
    },
    closePickerText: {
        fontSize: 14,
        fontFamily: Typography.sansBold,
        color: 'black',
        letterSpacing: 1.5,
    },
});
