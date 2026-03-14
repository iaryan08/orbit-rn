import React, { useState, useMemo, useEffect, useRef } from 'react';
import { View, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Volume2, VolumeX } from 'lucide-react-native';
import { getPublicStorageUrl } from '../lib/storage';
import { usePersistentMedia } from '../lib/media';
import { useOrbitStore } from '../lib/store';

const isVideoUrl = (url: string) => {
    if (!url) return false;
    const lower = url.toLowerCase();
    return lower.endsWith('.mp4') || lower.endsWith('.mov') || lower.includes('.mp4?') || lower.includes('.mov?');
};

interface MemoryImageProps {
    url: string;
    id: string;
    idToken: string | null | undefined;
    onPress: () => void;
    isActive: boolean;
    isParentVisible: boolean;
    isTabActive: boolean;
    width?: number; // Added width for carousel alignment
}

const VideoMedia = React.memo(({ sourceUri, isVisible, isMediaViewerOpen, onPress, width: customWidth }: { sourceUri: string, isVisible: boolean, isMediaViewerOpen: boolean, onPress: () => void, width?: number }) => {
    const [status, setStatus] = useState<string>('loading');
    const [isMuted, setIsMuted] = useState(true);
    
    const isReleased = useRef(false);
    const currentPlayerSrc = useRef('');
    const [activePlayer, setActivePlayer] = useState<any>(null);

    // NEW: Null Player Pattern - stabilize by initializing with an empty source
    const playerInstance = useVideoPlayer('', (p) => {
        p.loop = true;
        p.muted = true;
        p.staysActiveInBackground = false;
    });

    useEffect(() => {
        // Only set the active player after mount and ensure isReleased is reset
        isReleased.current = false;
        setActivePlayer(playerInstance);
        
        return () => {
            isReleased.current = true;
            setActivePlayer(null); // Clear before unmount to avoid property update crashes
        };
    }, [playerInstance]);

    useEffect(() => {
        if (!activePlayer || isReleased.current || !sourceUri) return;
        if (currentPlayerSrc.current !== sourceUri) {
             try {
                activePlayer.replace(sourceUri);
                currentPlayerSrc.current = sourceUri;
             } catch (e) {
                console.warn("[VideoMedia] Replace failed:", e);
             }
        }
    }, [sourceUri, activePlayer]);

    useEffect(() => {
        if (!activePlayer || isReleased.current) return;
        
        let sub: any;
        try {
            sub = activePlayer.addListener('statusChange', (payload: any) => {
                if (isReleased.current) return;
                const newStatus = (payload?.status || payload) as string;
                if (typeof newStatus === 'string') {
                    setStatus(newStatus);
                    // Safer way to trigger play: only if status is ready and conditions met
                    if ((newStatus === 'playing' || newStatus === 'readyToPlay') && isVisible && !isMediaViewerOpen) {
                        try { activePlayer.play(); } catch(e) { console.warn("[VideoMedia] Play failed on statusChange:", e); }
                    }
                }
            });

            // Initial check in case it's already ready
            const currentStatus = (activePlayer.status?.status || activePlayer.status) as string;
            if (typeof currentStatus === 'string' && !isReleased.current) {
                setStatus(currentStatus);
                if ((currentStatus === 'playing' || currentStatus === 'readyToPlay') && isVisible && !isMediaViewerOpen) {
                    try { activePlayer.play(); } catch(e) { console.warn("[VideoMedia] Play failed on initial check:", e); }
                }
            }
        } catch (e) {
            console.warn("[VideoMedia] Failed to setup listener:", e);
        }

        return () => sub?.remove();
    }, [activePlayer, isVisible, isMediaViewerOpen]);

    useEffect(() => {
        if (!activePlayer || isReleased.current) return;
        try {
            if (isVisible && !isMediaViewerOpen) {
                activePlayer.muted = isMuted;
                // Only attempt to play if the player is in a state where it can play
                if (status === 'readyToPlay' || status === 'playing') {
                    activePlayer.play();
                }
            } else {
                activePlayer.pause();
                activePlayer.muted = true;
            }
        } catch (e) { console.warn("[VideoMedia] Play/Pause/Mute failed:", e); }
    }, [isMuted, isVisible, isMediaViewerOpen, activePlayer, status]); // Added status to dependencies

    const showLoader = status === 'loading' || status === 'buffering' || status === 'waiting';

    return (
        <View style={[styles.mediaFull, customWidth ? { width: customWidth } : { width: '100%' }]}>
            {/* Add checks for player.status before rendering VideoView */}
            {!isReleased.current && activePlayer && (activePlayer.status?.status !== 'error') && (
                <VideoView
                    key={sourceUri} 
                    player={activePlayer}
                    style={styles.video}
                    contentFit="cover"
                    nativeControls={false}
                />
            )}
            
            <TouchableOpacity
                style={styles.videoTapOverlay}
                activeOpacity={1}
                onPress={onPress}
            />

            {showLoader && (
                <View style={styles.igLoaderContainer} pointerEvents="none">
                    <ActivityIndicator color="rgba(255,255,255,0.7)" size="small" />
                </View>
            )}

            <TouchableOpacity
                style={styles.videoMuteButton}
                activeOpacity={0.85}
                onPress={(e: any) => {
                    e?.stopPropagation?.();
                    setIsMuted(prev => !prev);
                }}
            >
                {isMuted ? <VolumeX size={14} color="white" /> : <Volume2 size={14} color="white" />}
            </TouchableOpacity>
        </View>
    );
});

export const MemoryImage = React.memo(({
    url,
    id,
    idToken,
    onPress,
    isActive,
    isParentVisible,
    isTabActive,
    width: customWidth,
}: MemoryImageProps) => {
    const rawUrl = useMemo(() => {
        return getPublicStorageUrl(url, 'memories', idToken || '') || undefined;
    }, [url, idToken]);
    
    const isMediaViewerOpen = useOrbitStore(state => state.mediaViewerState.isOpen);
    const videoMedia = useMemo(() => isVideoUrl(url), [url]);
    const [isImageLoading, setIsImageLoading] = useState(true);

    const isVisible = isActive && isParentVisible && isTabActive;
    
    // PersistentMedia returns local path if cached, else undefined
    const sourceUri = usePersistentMedia(id, rawUrl, isVisible);
    
    // 🔥 PERSISTENCE FIX: Once we find a URI (local or remote), keep it.
    // This prevents the "black screen" when scrolling back to an item that was previously visible.
    const [stableUri, setStableUri] = useState<string | undefined>(undefined);
    
    useEffect(() => {
        // Fallback to rawUrl immediately so we don't have a black screen.
        // sourceUri (local path) will take over once confirmed/downloaded.
        const currentUri = sourceUri || rawUrl;
        if (currentUri && currentUri !== stableUri) {
            setStableUri(currentUri);
        }
    }, [sourceUri, rawUrl, stableUri]);

    // If we truly have no URL or path, show a themed placeholder
    if (!url && !stableUri) return (
        <View style={[styles.mediaFull, styles.emptyPlaceholder, customWidth ? { width: customWidth } : {}]}>
             <ActivityIndicator color="rgba(255,255,255,0.1)" size="small" />
        </View>
    );

    if (videoMedia) {
        // ALWAYS render VideoMedia if it's a video to honor "DO NOT UNMOUNT"
        // Show a colored placeholder while loading to avoid "black wall" effect
        if (!stableUri) return (
            <View style={[styles.mediaFull, { 
                backgroundColor: isActive ? 'rgba(99, 102, 241, 0.05)' : '#000',
                justifyContent: 'center',
                alignItems: 'center',
                width: customWidth || '100%'
            }]}>
                <ActivityIndicator color="rgba(255,255,255,0.1)" size="small" />
            </View>
        );
        
        return (
            <VideoMedia 
                sourceUri={stableUri} 
                isVisible={isVisible} 
                isMediaViewerOpen={isMediaViewerOpen} 
                onPress={onPress} 
                width={customWidth}
            />
        );
    }

    return (
        <TouchableOpacity 
            activeOpacity={0.9} 
            onPress={onPress} 
            style={[styles.mediaFull, customWidth ? { width: customWidth } : {}]}
        >
            <Image
                source={{ uri: stableUri || undefined }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                transition={200}
                cachePolicy="memory-disk"
                onLoadStart={() => setIsImageLoading(true)}
                onLoad={() => setIsImageLoading(false)}
            />
            {isImageLoading && stableUri && (
                <View style={styles.igLoaderContainer} pointerEvents="none">
                    <ActivityIndicator color="rgba(255,255,255,0.4)" size="small" />
                </View>
            )}
        </TouchableOpacity>
    );
});

const styles = StyleSheet.create({
    mediaFull: {
        width: '100%',
        height: '100%',
        overflow: 'hidden',
    },
    video: {
        flex: 1,
        width: '100%',
        height: '100%',
    },
    videoTapOverlay: {
        ...StyleSheet.absoluteFillObject,
        zIndex: 10,
    },
    igLoaderContainer: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 15,
    },
    emptyPlaceholder: {
        backgroundColor: 'rgba(255,255,255,0.03)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    videoMuteButton: {
        position: 'absolute',
        right: 12,
        bottom: 12,
        width: 30,
        height: 30,
        borderRadius: 15,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.45)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.14)',
        zIndex: 20,
    },
});
