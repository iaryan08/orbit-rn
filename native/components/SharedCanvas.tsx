import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, Platform, Image } from 'react-native';

import { Download, Undo2, Redo2, Trash2, Edit2, Shield, ShieldOff, Eraser, Move, Palette, X } from 'lucide-react-native';
import { Colors, Radius, Spacing, Typography } from '../constants/Theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
    Canvas,
    Path,
    Group,
    Skia,
    SkPath,
    useCanvasRef,
    PaintStyle,
    StrokeCap,
    StrokeJoin,
    BlendMode,
    Picture,
} from '@shopify/react-native-skia';
import { useOrbitStore } from '../lib/store';
import { db, rtdb } from '../lib/firebase';
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { ref, onValue, set as rtdbSet, remove, onDisconnect } from 'firebase/database';
import * as Haptics from 'expo-haptics';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, runOnJS, FadeIn } from 'react-native-reanimated';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system/legacy';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const LOGICAL_SIZE = 1500;
const CANVAS_WIDTH = SCREEN_WIDTH;
const CANVAS_HEIGHT = SCREEN_WIDTH; // Square canvas for perfect web-sync parity

interface Point { x: number; y: number }
interface Stroke {
    points: Point[];
    color: string;
    width: number;
    isEraser?: boolean;
    skPath?: SkPath; // UI thread cached path
}

/**
 * Premium Shared Canvas optimized for Redmi 12.
 * Includes RTDB delta sync for multi-pen support, pinch-zoom, and premium animation.
 */
export function SharedCanvas() {
    const { couple, profile, partnerProfile } = useOrbitStore();
    const canvasRef = useCanvasRef();
    const [strokes, setStrokes] = useState<Stroke[]>([]);
    const [activeTool, setActiveTool] = useState<'pen' | 'eraser' | 'pan'>('pen');
    const [isShieldMode, setIsShieldMode] = useState(false);
    const [redoStrokes, setRedoStrokes] = useState<Stroke[]>([]);
    const [activeColor, setActiveColor] = useState(Colors.dark.rose[400]);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [showColorPicker, setShowColorPicker] = useState(false);
    const [showClearConfirm, setShowClearConfirm] = useState(false);
    const [partnerActiveStroke, setPartnerActiveStroke] = useState<Stroke | null>(null);

    // Fast point recording refs
    const currentPoints = useRef<Point[]>([]);
    const lastSyncAt = useRef(0);

    const PRESET_COLORS = ['#ffffff', Colors.dark.rose[400], '#a855f7'];
    const rainbowPosition = useSharedValue(0.5); // 0 to 1

    // Reanimated values for Zoom & Pan
    const scale = useSharedValue(1);
    const savedScale = useSharedValue(1);
    const translateX = useSharedValue(0);
    const translateY = useSharedValue(0);
    const savedTranslateX = useSharedValue(0);
    const savedTranslateY = useSharedValue(0);

    // Performance: UI Thread SharedValues for ultra-smooth drawing
    const activePath = useSharedValue(Skia.Path.Make());
    const isDrawing = useSharedValue(false);
    const isMirroring = useSharedValue(false);

    // Fast point recording refs
    // currentPoints etc are declared above now

    const thumbAnimatedStyle = useAnimatedStyle(() => ({
        left: rainbowPosition.value * 216,
    }));

    // Performance Optimization: Capped DPI for budget devices (Redmi 12)
    const dpr = Math.min(Platform.OS === 'web' ? window.devicePixelRatio : 2, 1.5);

    // ── Helper: Point Array to Skia Path ─────────────────────────────────────
    const pointsToPath = useCallback((points: Point[]) => {
        if (points.length < 2) return null;
        const path = Skia.Path.Make();
        path.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length - 1; i++) {
            const midX = (points[i].x + points[i + 1].x) / 2;
            const midY = (points[i].y + points[i + 1].y) / 2;
            path.quadTo(points[i].x, points[i].y, midX, midY);
        }
        path.lineTo(points[points.length - 1].x, points[points.length - 1].y);
        return path;
    }, []);

    // Auto-Shield on Mount (Scroll out feel)
    useEffect(() => {
        setIsShieldMode(false);
        return () => setIsShieldMode(true);
    }, []);

    // ── Helper: Re-bake background strokes into a single Picture layer ───────────
    const backgroundPicture = React.useMemo(() => {
        const recorder = Skia.PictureRecorder();
        const canvas = recorder.beginRecording(Skia.XYWHRect(0, 0, LOGICAL_SIZE, LOGICAL_SIZE));
        const paint = Skia.Paint();
        paint.setStyle(PaintStyle.Stroke);
        paint.setStrokeCap(StrokeCap.Round);
        paint.setStrokeJoin(StrokeJoin.Round);

        strokes.forEach(s => {
            paint.setColor(Skia.Color(s.color));
            paint.setStrokeWidth(s.width);
            if (s.isEraser) {
                paint.setBlendMode(BlendMode.Clear);
            } else {
                paint.setBlendMode(BlendMode.SrcOver);
            }
            const path = s.skPath || pointsToPath(s.points);
            if (path) canvas.drawPath(path, paint);
        });

        return recorder.finishRecordingAsPicture();
    }, [strokes, pointsToPath]);

    // ── Firestore: Load Whole State ──────────────────────────────────────────
    useEffect(() => {
        if (!couple?.id) return;
        const unsub = onSnapshot(doc(db, 'couples', couple.id, 'doodles', 'latest'), (doc) => {
            if (doc.exists()) {
                const data = doc.data();
                if (data.path_data) {
                    try {
                        const parsed = JSON.parse(data.path_data) as Stroke[];
                        if (Array.isArray(parsed)) {
                            // High Performance: Pre-calculate Skia Paths for whole collection
                            const withPaths = parsed.map(s => ({
                                ...s,
                                skPath: pointsToPath(s.points) || undefined
                            }));
                            setStrokes(withPaths);
                        }
                    } catch (e) {
                        console.error("[SharedCanvas] JSON Parse error:", e);
                    }
                }
            } else {
                setStrokes([]);
            }
        });
        return unsub;
    }, [couple?.id]);

    // ── RTDB: Listen for Partner's Active Stroke & Viewport ───────────────────
    useEffect(() => {
        if (!couple?.id || !partnerProfile?.id) return;
        const partnerRef = ref(rtdb, `broadcasts/${couple.id}/${partnerProfile.id}`);
        const unsub = onValue(partnerRef, (snapshot) => {
            const data = snapshot.val();
            if (data?.event === 'doodle_delta') {
                const stroke = data.payload as Stroke;
                if (stroke?.points) {
                    stroke.skPath = pointsToPath(stroke.points) || undefined;
                }
                setPartnerActiveStroke(stroke);
            } else if (data?.event === 'viewport_sync') {
                if (!isMirroring.value) {
                    const { s, tx, ty } = data.payload;
                    scale.value = withTiming(s, { duration: 100 });
                    translateX.value = withTiming(tx, { duration: 100 });
                    translateY.value = withTiming(ty, { duration: 100 });
                    savedScale.value = s;
                    savedTranslateX.value = tx;
                    savedTranslateY.value = ty;
                }
                setPartnerActiveStroke(null);
            } else {
                setPartnerActiveStroke(null);
            }
        });
        return unsub;
    }, [couple?.id, partnerProfile?.id, pointsToPath]);

    const broadcastViewport = (s: number, tx: number, ty: number) => {
        if (!couple?.id || !profile?.id) return;
        const now = Date.now();
        if (now - lastSyncAt.current > 64) {
            lastSyncAt.current = now;
            const viewportRef = ref(rtdb, `broadcasts/${couple.id}/${profile.id}`);
            rtdbSet(viewportRef, {
                event: 'viewport_sync',
                payload: { s, tx, ty },
                timestamp: now
            });
        }
    };

    // ── Drawing Actions ──────────────────────────────────────────────────────
    useEffect(() => {
        if (!couple?.id || !profile?.id) return;
        const broadcastRef = ref(rtdb, `broadcasts/${couple.id}/${profile.id}`);
        onDisconnect(broadcastRef).remove();
    }, [couple?.id, profile?.id]);

    const broadcastDelta = (stroke: Stroke | null) => {
        if (!couple?.id || !profile?.id) return;
        const deltaRef = ref(rtdb, `broadcasts/${couple.id}/${profile.id}`);
        if (stroke) {
            rtdbSet(deltaRef, { event: 'doodle_delta', payload: stroke, timestamp: Date.now() });
        } else {
            remove(deltaRef);
        }
    };

    const startDrawing = (x: number, y: number) => {
        if (isShieldMode || activeTool === 'pan') return;
        currentPoints.current = [{ x, y }];
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    };

    const continueDrawing = (x: number, y: number) => {
        if (isShieldMode || activeTool === 'pan' || !isDrawing.value) return;
        const last = currentPoints.current[currentPoints.current.length - 1];
        const dist = Math.hypot(x - last.x, y - last.y);
        if (dist < 1.5) return; // Follow fingertips closer

        currentPoints.current.push({ x, y });

        // Throttle RTDB broadcasts for fluidity
        const now = Date.now();
        if (now - lastSyncAt.current > 32) {
            lastSyncAt.current = now;
            broadcastDelta({
                points: currentPoints.current,
                color: activeTool === 'eraser' ? '#070707' : activeColor,
                width: activeTool === 'eraser' ? 20 : 3,
                isEraser: activeTool === 'eraser'
            });
        }
    };

    const endDrawing = async () => {
        if (!isDrawing.value || !couple?.id) return;
        const finalStroke: Stroke = {
            points: [...currentPoints.current],
            color: activeTool === 'eraser' ? '#070707' : activeColor,
            width: activeTool === 'eraser' ? 20 : 3,
            isEraser: activeTool === 'eraser',
            skPath: pointsToPath(currentPoints.current) || undefined
        };

        const updated = [...strokes, finalStroke];
        setStrokes(updated);
        broadcastDelta(null);

        // Reset local path state
        activePath.value = Skia.Path.Make();
        currentPoints.current = [];

        // Persist to Firestore
        await setDoc(doc(db, 'couples', couple.id, 'doodles', 'latest'), {
            couple_id: couple.id,
            user_id: profile?.id,
            path_data: JSON.stringify(updated),
            updated_at: serverTimestamp()
        });
    };

    // ── Gestures: Drawing + Zoom + Pan ───────────────────────────────────────
    const drawingGesture = Gesture.Pan()
        .enabled(!isShieldMode && activeTool !== 'pan')
        .onBegin((e) => {
            'worklet';
            isDrawing.value = true;
            // FIXED Mapping: Inverse of [{scale}, {translateX}, {translateY}]
            const s = scale.value * (SCREEN_WIDTH / LOGICAL_SIZE);
            const x = (e.x - translateX.value) / s;
            const y = (e.y - translateY.value) / s;
            activePath.value.moveTo(x, y);
            runOnJS(startDrawing)(x, y);
        })
        .onUpdate((e) => {
            'worklet';
            const s = scale.value * (SCREEN_WIDTH / LOGICAL_SIZE);
            const x = (e.x - translateX.value) / s;
            const y = (e.y - translateY.value) / s;

            // Silky Smooth quadratic curves
            const last = activePath.value.getLastPt();
            const midX = (last.x + x) / 2;
            const midY = (last.y + y) / 2;
            activePath.value.quadTo(last.x, last.y, midX, midY);

            runOnJS(continueDrawing)(x, y);
        })
        .onEnd(() => {
            'worklet';
            isDrawing.value = false;
            runOnJS(endDrawing)();
        })
        .minDistance(0);

    const pinchGesture = Gesture.Pinch()
        .onBegin(() => { isMirroring.value = true; })
        .onUpdate((e) => {
            scale.value = Math.max(0.5, Math.min(5, savedScale.value * e.scale));
            runOnJS(broadcastViewport)(scale.value, translateX.value, translateY.value);
        })
        .onEnd(() => {
            savedScale.value = scale.value;
            isMirroring.value = false;
        });

    const panGesture = Gesture.Pan()
        .enabled(activeTool === 'pan')
        .onBegin(() => { isMirroring.value = true; })
        .onUpdate((e) => {
            translateX.value = savedTranslateX.value + e.translationX;
            translateY.value = savedTranslateY.value + e.translationY;
            runOnJS(broadcastViewport)(scale.value, translateX.value, translateY.value);
        })
        .onEnd(() => {
            savedTranslateX.value = translateX.value;
            savedTranslateY.value = translateY.value;
            isMirroring.value = false;
        });

    const composed = Gesture.Simultaneous(drawingGesture, panGesture, pinchGesture);

    // ── Actions ──────────────────────────────────────────────────────────────
    const handleUndo = async () => {
        if (isShieldMode || strokes.length === 0 || !couple?.id) return;
        const last = strokes[strokes.length - 1];
        setRedoStrokes(prev => [...prev, last]);
        const next = strokes.slice(0, -1);
        setStrokes(next);
        await setDoc(doc(db, 'couples', couple.id, 'doodles', 'latest'), {
            path_data: JSON.stringify(next),
            updated_at: serverTimestamp()
        }, { merge: true });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    };

    const handleRedo = async () => {
        if (isShieldMode || redoStrokes.length === 0 || !couple?.id) return;
        const last = redoStrokes[redoStrokes.length - 1];
        setRedoStrokes(prev => prev.slice(0, -1));
        const next = [...strokes, last];
        setStrokes(next);
        await setDoc(doc(db, 'couples', couple.id, 'doodles', 'latest'), {
            path_data: JSON.stringify(next),
            updated_at: serverTimestamp()
        }, { merge: true });
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    };

    const handleClearCanvas = async () => {
        if (!couple?.id) return;
        setStrokes([]);
        // Force complete overwrite instead of merge to clear
        await setDoc(doc(db, 'couples', couple.id, 'doodles', 'latest'), {
            couple_id: couple.id,
            user_id: profile?.id,
            path_data: JSON.stringify([]),
            updated_at: serverTimestamp()
        });

        // Also clear any active RTDB strokes
        broadcastDelta(null);

        setShowClearConfirm(false);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    };

    const handleDownload = async () => {
        if (!canvasRef.current) return;
        const image = canvasRef.current.makeImageSnapshot();
        if (image) {
            const base64 = image.encodeToBase64();
            const uri = `${FileSystem.cacheDirectory}orbit-doodle-${Date.now()}.png`;
            await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
            const { status } = await MediaLibrary.requestPermissionsAsync();
            if (status === 'granted') {
                await MediaLibrary.saveToLibraryAsync(uri);
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            }
        }
    };

    const containerStyle = useAnimatedStyle(() => ({
        transform: [
            { translateX: translateX.value },
            { translateY: translateY.value },
            { scale: scale.value }
        ]
    }));

    return (
        <View style={styles.container}>
            <GestureDetector gesture={composed}>
                <View style={styles.drawingArea}>
                    <Canvas ref={canvasRef} style={StyleSheet.absoluteFill}>
                        <Group transform={useAnimatedStyle(() => ({
                            transform: [
                                { translateX: translateX.value },
                                { translateY: translateY.value },
                                { scale: scale.value * (SCREEN_WIDTH / LOGICAL_SIZE) },
                            ]
                        })).transform}>
                            {/* Static layers baked into one single GPU operation */}
                            <Picture picture={backgroundPicture} />

                            {partnerActiveStroke && (
                                <Path
                                    path={partnerActiveStroke.skPath || pointsToPath(partnerActiveStroke.points) || Skia.Path.Make()}
                                    color={partnerActiveStroke.color}
                                    style="stroke"
                                    strokeWidth={partnerActiveStroke.width}
                                    strokeCap="round"
                                    strokeJoin="round"
                                />
                            )}

                            <Path
                                path={activePath}
                                color={activeTool === 'eraser' ? '#070707' : activeColor}
                                style="stroke"
                                strokeWidth={activeTool === 'eraser' ? 20 : 3}
                                strokeCap="round"
                                strokeJoin="round"
                            />
                        </Group>
                    </Canvas>

                    {isShieldMode && (
                        <View style={styles.shieldOverlay} pointerEvents="none">
                            <Text style={styles.shieldText}>SHIELD ACTIVE • VIEW ONLY</Text>
                        </View>
                    )}

                </View>
            </GestureDetector>

            {showClearConfirm && (
                <View style={styles.clearConfirmOverlay}>
                    <View style={[styles.clearConfirmBlur, { backgroundColor: 'rgba(15,15,15,0.95)' }]}>
                        <View style={styles.clearConfirmPill}>
                            <Text style={styles.clearConfirmText}>clear canvas?  </Text>
                            <TouchableOpacity onPress={() => setShowClearConfirm(false)} style={styles.confirmActionBtn}>
                                <Text style={styles.cancelActionText}>no</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={handleClearCanvas} style={styles.confirmActionBtn}>
                                <Text style={styles.clearActionText}>yes</Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                </View>
            )}

            {/* Top Toolbar */}
            <View style={styles.topHeader} pointerEvents="box-none">
                <View style={[styles.guestbookBlur, { backgroundColor: 'rgba(15,15,15,0.8)' }]}>
                    <View style={styles.guestbookPill}>
                        <Text style={styles.guestbookText}>SHARED GUESTBOOK</Text>
                    </View>
                </View>


                <View style={[styles.syncIndicator, { marginLeft: 8 }]}>
                    <View style={styles.syncDot} />
                    <View style={styles.syncDivider} />
                    <TouchableOpacity
                        onPress={() => {
                            setIsShieldMode(!isShieldMode);
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                        }}
                    >
                        {isShieldMode ? <Shield color="#fb7185" size={16} /> : <ShieldOff color="white" size={16} />}
                    </TouchableOpacity>
                    <View style={styles.syncDivider} />
                    <TouchableOpacity onPress={handleDownload}>
                        <Download color="white" size={16} opacity={0.6} />
                    </TouchableOpacity>
                </View>
            </View>

            {/* Web-Style Bottom-Right Menu */}
            <View style={styles.bottomMenu} pointerEvents="box-none">
                {showColorPicker && (
                    <Animated.View
                        entering={FadeIn.duration(200)}
                        style={styles.slimSliderContainer}
                    >
                        <GestureDetector gesture={Gesture.Pan().onUpdate((e) => {
                            rainbowPosition.value = Math.max(0, Math.min(1, e.x / 180));
                            const hue = rainbowPosition.value * 360;
                            runOnJS(setActiveColor)(`hsl(${hue}, 70%, 60%)`);
                        })}>
                            <View style={styles.rainbowTrack}>
                                <View style={[StyleSheet.absoluteFill, { borderRadius: 5, overflow: 'hidden' }]}>
                                    <Image
                                        source={require('../assets/rainbow-picker.png')}
                                        style={{ width: '100%', height: '100%' }}
                                        resizeMode="stretch"
                                    />
                                </View>
                                <Animated.View style={[styles.pickerThumb, thumbAnimatedStyle]} />
                            </View>
                        </GestureDetector>
                    </Animated.View>
                )}
                <View style={styles.menuContainer}>
                    {isMenuOpen && (
                        <Animated.View
                            entering={FadeIn.duration(200)}
                            style={styles.expandedPill}
                        >
                            <TouchableOpacity
                                style={styles.closeBtn}
                                onPress={() => {
                                    setIsMenuOpen(false);
                                    setShowColorPicker(false);
                                }}
                            >
                                <X size={14} color="white" />
                            </TouchableOpacity>

                            <View style={styles.menuDivider} />

                            <TouchableOpacity
                                style={styles.menuIconBtn}
                                onPress={() => {
                                    if (isShieldMode || !couple?.id) return;
                                    setShowClearConfirm(true);
                                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                                }}
                            >
                                <Trash2 size={16} color="rgba(255,255,255,0.4)" />
                            </TouchableOpacity>

                            <TouchableOpacity style={styles.menuIconBtn} onPress={handleRedo}>
                                <Redo2 size={16} color={redoStrokes.length > 0 ? "white" : "rgba(255,255,255,0.2)"} />
                            </TouchableOpacity>

                            <TouchableOpacity style={styles.menuIconBtn} onPress={handleUndo}>
                                <Undo2 size={16} color="white" />
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[styles.menuIconBtn, (activeTool === 'pen' || activeTool === 'pan') && styles.activeMenuBtn]}
                                onPress={() => {
                                    setActiveTool(activeTool === 'pan' ? 'pen' : 'pan');
                                    setIsShieldMode(false);
                                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                                }}
                            >
                                {activeTool === 'pen' ? (
                                    <Move size={14} color="white" />
                                ) : (
                                    <Edit2 size={14} color="white" />
                                )}
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[styles.menuIconBtn, activeTool === 'eraser' && styles.activeMenuBtn]}
                                onPress={() => {
                                    setActiveTool('eraser');
                                    setIsShieldMode(false);
                                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                                }}
                            >
                                <Eraser size={14} color="white" />
                            </TouchableOpacity>

                            <View style={styles.menuDivider} />

                            <TouchableOpacity
                                style={styles.rainbowPill}
                                onPress={() => {
                                    setShowColorPicker(!showColorPicker);
                                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                }}
                            >
                                <View style={[styles.rainbowInnerCircle, { borderColor: showColorPicker ? 'white' : 'transparent' }]}>
                                    <Image
                                        source={require('../assets/rainbow-picker.png')}
                                        style={styles.rainbowImg}
                                    />
                                </View>
                            </TouchableOpacity>

                            {/* Color Presets */}
                            {PRESET_COLORS.map(c => (
                                <TouchableOpacity
                                    key={c}
                                    onPress={() => {
                                        setActiveColor(c);
                                        setActiveTool('pen');
                                        setIsShieldMode(false);
                                        setShowColorPicker(false);
                                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                    }}
                                    style={[styles.colorDot, { backgroundColor: c }, activeColor === c && activeTool === 'pen' && styles.activeDot]}
                                />
                            ))}
                        </Animated.View>
                    )}

                    {!isMenuOpen && (
                        <View style={[styles.fabBlur, { backgroundColor: 'rgba(15,15,15,0.9)' }]}>
                            <TouchableOpacity
                                style={styles.mainFab}
                                onPress={() => {
                                    if (isShieldMode) {
                                        setIsShieldMode(false);
                                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                                    } else {
                                        setIsMenuOpen(true);
                                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                                    }
                                }}
                            >
                                <Edit2 size={20} color="white" />
                            </TouchableOpacity>
                        </View>

                    )}
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        width: SCREEN_WIDTH,
        height: 480,
        backgroundColor: '#070707',
        marginVertical: Spacing.xl,
        borderTopWidth: 1,
        borderBottomWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
        overflow: 'hidden',
    },
    drawingArea: {
        flex: 1,
        overflow: 'hidden',
    },
    bottomMenu: {
        position: 'absolute',
        bottom: 12,
        right: 12,
        alignItems: 'flex-end',
        zIndex: 100,
    },
    menuContainer: {
        flexDirection: 'row-reverse',
        alignItems: 'center',
        gap: 12,
    },
    menuOverlay: {
        flexDirection: 'column',
        alignItems: 'center',
        gap: 16,
    },
    slimSliderContainer: {
        width: 180,
        backgroundColor: 'rgba(15, 15, 15, 0.95)',
        padding: 12,
        borderRadius: 100,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 10,
        marginBottom: 12,
        marginRight: 10,
    },
    pickerTitle: {
        color: 'rgba(255,255,255,0.4)',
        fontSize: 10,
        fontFamily: Typography.sansBold,
        letterSpacing: 1.5,
    },
    rainbowTrack: {
        height: 10,
        width: '100%',
        borderRadius: 5,
        backgroundColor: '#333',
    },
    rainbowGradient: {
        flex: 1,
        backgroundColor: 'transparent',
    },
    pickerThumb: {
        position: 'absolute',
        top: -5,
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: 'white',
        borderWidth: 2,
        borderColor: 'black',
    },
    expandedPill: {
        flexDirection: 'row-reverse',
        alignItems: 'center',
        backgroundColor: 'rgba(15, 15, 15, 0.95)',
        borderRadius: 100,
        paddingHorizontal: 6,
        paddingVertical: 3,
        gap: 6,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 10,
    },
    colorDot: {
        width: 16,
        height: 16,
        borderRadius: 8,
        borderWidth: 1.2,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    activeDot: {
        borderColor: 'white',
        borderWidth: 1.5,
    },
    rainbowPill: {
        width: 22,
        height: 22,
        borderRadius: 11,
        overflow: 'hidden',
    },
    rainbowInnerCircle: {
        width: 22,
        height: 22,
        borderRadius: 11,
        borderWidth: 2,
        overflow: 'hidden',
    },
    rainbowImg: {
        width: '100%',
        height: '100%',
    },
    menuDivider: {
        width: 1,
        height: 12,
        backgroundColor: 'rgba(255,255,255,0.1)',
        marginHorizontal: 1,
    },
    menuIconBtn: {
        width: 24,
        height: 24,
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 12,
    },
    activeMenuBtn: {
        backgroundColor: Colors.dark.rose[400],
    },
    closeBtn: {
        width: 22,
        height: 22,
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 11,
        backgroundColor: 'rgba(255,255,255,0.08)',
    },
    clearConfirmOverlay: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 200,
    },
    clearConfirmBlur: {
        borderRadius: 100,
        overflow: 'hidden',
    },
    clearConfirmPill: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(15, 15, 15, 0.9)',
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 100,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        gap: 12,
    },
    clearConfirmText: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 13,
        fontFamily: Typography.sansBold,
    },
    confirmActionBtn: {
        paddingHorizontal: 4,
    },
    clearActionText: {
        color: '#f43f5e',
        fontSize: 13,
        fontFamily: Typography.sansBold,
    },
    cancelActionText: {
        color: 'rgba(255,255,255,0.4)',
        fontSize: 13,
        fontFamily: Typography.sansBold,
    },
    fabBlur: {
        borderRadius: 23,
        overflow: 'hidden',
    },
    mainFab: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(244, 63, 94, 0.25)',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(244, 63, 94, 0.4)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 10,
    },
    shieldOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.6)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    shieldText: {
        color: 'rgba(255,255,255,0.4)',
        fontSize: 12,
        fontFamily: Typography.sansBold,
        letterSpacing: 2,
    },
    topHeader: {
        position: 'absolute',
        top: 20,
        left: 20,
        right: 20,
        flexDirection: 'row',
        alignItems: 'center',
        zIndex: 20,
    },
    guestbookBlur: {
        borderRadius: 100,
        overflow: 'hidden',
    },
    guestbookPill: {
        paddingHorizontal: 10,
        paddingVertical: 5,
        backgroundColor: 'rgba(244, 63, 94, 0.25)',
        borderRadius: 100,
        borderWidth: 1,
        borderColor: 'rgba(244, 63, 94, 0.4)',
    },
    guestbookText: {
        fontSize: 9,
        fontFamily: Typography.sansBold,
        color: '#fb7185',
        letterSpacing: 1.5,
    },
    syncIndicator: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 12,
        paddingVertical: 5,
        backgroundColor: 'rgba(255, 255, 255, 0.03)',
        borderRadius: 100,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
    },
    syncDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#10b981',
        opacity: 0.6,
    },
    syncDivider: {
        width: 1,
        height: 12,
        backgroundColor: 'rgba(255,255,255,0.1)',
    },
});
