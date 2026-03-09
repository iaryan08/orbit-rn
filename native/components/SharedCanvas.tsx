import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, Platform, Image, Alert } from 'react-native';

import { Download, Undo2, Redo2, Trash2, Edit2, Shield, ShieldOff, Eraser, Move, X } from 'lucide-react-native';
import { Colors, Radius, Spacing, Typography } from '../constants/Theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
    Canvas,
    Path,
    Group,
    Skia,
    SkPath,
    SkPicture,
    useCanvasRef,
    PaintStyle,
    StrokeCap,
    StrokeJoin,
    BlendMode,
    Picture,
    LinearGradient,
    vec,
    Rect,
    ImageFormat,
} from '@shopify/react-native-skia';
import { useOrbitStore } from '../lib/store';
import { db, rtdb } from '../lib/firebase';
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { ref, onValue, set as rtdbSet, onDisconnect } from 'firebase/database';
import * as Haptics from 'expo-haptics';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, runOnJS, FadeIn } from 'react-native-reanimated';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system/legacy';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const LOGICAL_SIZE = 1500;
const CANVAS_WIDTH = SCREEN_WIDTH;
const CANVAS_HEIGHT = SCREEN_WIDTH; // Square canvas for perfect web-sync parity
const SIMPLE_NATIVE_CANVAS = true;
const FORCE_CANVAS_RESET_ONCE = false;
const ENABLE_RTDB_CANVAS_SYNC = true;
// Keep debug instrumentation in codebase, but disabled for production builds.
const ENABLE_DEBUG_CHIP = false;
const LIVE_PATH_MAX_JUMP_PX = 42;
const REDMI12_POINT_MIN_DIST = 0.6;
const LOW_LATENCY_SYNC_MS = 100; // Optimal balance (10 updates/sec) - Industry standard for stability & battery
const FIRESTORE_PERSIST_MS = 1000; // Batch Firestore saves faster for background durability
const JS_POINT_DISPATCH_MS = 16; // 60fps dispatch
const POINT_PRECISION = 10; // 1 decimal

interface Point { x: number; y: number }
interface Stroke {
    id: string;
    points: Point[];
    color: string;
    width: number;
    tool?: 'pen' | 'eraser';
    isEraser?: boolean;
    skPath?: SkPath; // UI thread cached path
}

type CanvasMode = 'static' | 'readOnly' | 'draw' | 'pan';

type DeltaEventPayload =
    | { type: 'start'; id: string; points: Point[]; meta: { color: string; width: number; isEraser: boolean } }
    | { type: 'points'; id: string; points: Point[] }
    | { type: 'end'; id: string }
    | { event: 'drawing-state'; isDrawing: boolean }
    | { event: 'scroll-sync'; s: number; tx: number; ty: number };

const quantizePoint = (p: Point): Point => ({
    x: Math.round(p.x * POINT_PRECISION) / POINT_PRECISION,
    y: Math.round(p.y * POINT_PRECISION) / POINT_PRECISION,
});

function hueToHex(h: number): string {
    const s = 0.9, l = 0.58;
    const a = s * Math.min(l, 1 - l);
    const f = (n: number) => {
        const k = (n + h / 30) % 12;
        const b = l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
        return Math.round(255 * b).toString(16).padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
}

/**
 * Premium Shared Canvas optimized for Redmi 12.
 * Includes RTDB delta sync for multi-pen support, pinch-zoom, and premium animation.
 */
export function SharedCanvas() {
    const { couple, profile, partnerProfile } = useOrbitStore();
    const canvasRef = useCanvasRef();
    const drawingAreaRef = useRef<View | null>(null);
    const drawingAreaBoundsRef = useRef({ x: 0, y: 0, width: CANVAS_WIDTH, height: CANVAS_HEIGHT });
    const [strokes, setStrokes] = useState<Stroke[]>([]);
    const [canvasMode, setCanvasMode] = useState<CanvasMode>('readOnly');
    const [activeTool, setActiveTool] = useState<'pen' | 'eraser'>('pen');
    const [redoStrokes, setRedoStrokes] = useState<Stroke[]>([]);
    const [activeColor, setActiveColor] = useState(Colors.dark.rose[400]);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [showColorPicker, setShowColorPicker] = useState(false);
    const [showClearConfirm, setShowClearConfirm] = useState(false);
    const [isPartnerOnline, setIsPartnerOnline] = useState(false);
    const [debugIsDrawing, setDebugIsDrawing] = useState(false);
    const [debugTouchEvents, setDebugTouchEvents] = useState(0);

    // Performance Optimization: Moved partnerActiveStroke state to SharedValues to prevent re-renders
    const partnerPath = useSharedValue(Skia.Path.Make());
    const partnerPointCount = useSharedValue(0);
    const partnerMeta = useSharedValue({ color: '#ffffff', width: 3, isEraser: false });
    const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const latestStrokesRef = useRef<Stroke[]>([]);
    const pictureCacheRef = useRef<{ picture: SkPicture | null; ids: string[] }>({ picture: null, ids: [] });
    const lastLocalStrokeAtRef = useRef(0);
    const isDrawingRef = useRef(false);
    const lastDrawPointRef = useRef<Point | null>(null);
    const pendingLocalWriteRef = useRef(false);
    const currentStrokeIdRef = useRef<string | null>(null);
    const syncedPointCountRef = useRef(0);
    const remoteStrokesRef = useRef<Record<string, Stroke>>({});
    const lastProcessedBySenderRef = useRef<Record<string, number>>({});

    // Fast point recording refs
    const currentPoints = useRef<Point[]>([]);
    const lastDeltaSyncAt = useRef(0);
    const lastViewportSyncAt = useRef(0);
    const didAutoResetRef = useRef(false);

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
    const uiLastX = useSharedValue(0);
    const uiLastY = useSharedValue(0);
    const uiHasPoint = useSharedValue(false);
    const lastJsDispatchAt = useSharedValue(0);

    const handleSaveToGallery = async () => {
        try {
            const { status } = await MediaLibrary.requestPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert("Permission", "Please allow gallery access to save your drawing.");
                return;
            }

            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            const image = canvasRef.current?.makeImageSnapshot();
            if (!image) return;

            const base64 = image.encodeToBase64(ImageFormat.PNG, 100);
            const filename = `${FileSystem.cacheDirectory}orbit_canvas_${Date.now()}.png`;

            await FileSystem.writeAsStringAsync(filename, base64, { encoding: FileSystem.EncodingType.Base64 });
            await MediaLibrary.saveToLibraryAsync(filename);

            Alert.alert("Saved!", "Your drawing has been saved to your gallery.");
        } catch (e) {
            console.error(e);
            Alert.alert("Error", "Failed to save drawing.");
        }
    };

    // Fast point recording refs
    const thumbAnimatedStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: rainbowPosition.value * 140 }], // 140 is track width
        backgroundColor: activeColor,
        shadowColor: activeColor,
        shadowOpacity: 0.6,
        shadowRadius: 10,
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

    const isShieldMode = canvasMode !== 'draw';
    const isPanMode = canvasMode === 'pan' || canvasMode === 'readOnly';
    const canDraw = canvasMode !== 'readOnly' && canvasMode !== 'pan';
    const canUseCanvasRTDB = ENABLE_RTDB_CANVAS_SYNC && isPartnerOnline && canvasMode === 'draw';

    // Safety: never stay in non-interactive static mode on native.
    useEffect(() => {
        if (canvasMode === 'static') setCanvasMode('readOnly');
    }, [canvasMode]);

    useEffect(() => {
        latestStrokesRef.current = strokes;
    }, [strokes]);

    useEffect(() => {
        if (!couple?.id || !partnerProfile?.id) return;
        const presenceRef = ref(rtdb, `presence/${couple.id}/${partnerProfile.id}`);
        const unsub = onValue(presenceRef, (snapshot) => {
            const data = snapshot.val();
            const lastChanged = typeof data?.last_changed === 'number' ? data.last_changed : 0;
            const isFresh = lastChanged > 0 && (Date.now() - lastChanged) < 90_000;
            setIsPartnerOnline((!!data?.is_online || !!data?.in_cinema) && isFresh);
        });
        return unsub;
    }, [couple?.id, partnerProfile?.id]);

    // ── Helper: Re-bake background strokes into a single Picture layer ───────────
    const backgroundPicture = React.useMemo(() => {
        const nextIds = strokes.map(s => s.id);
        const prevIds = pictureCacheRef.current.ids;
        const appendOnly =
            prevIds.length > 0 &&
            nextIds.length > prevIds.length &&
            prevIds.every((id, idx) => id === nextIds[idx]);

        const recorder = Skia.PictureRecorder();
        const canvas = recorder.beginRecording(Skia.XYWHRect(0, 0, LOGICAL_SIZE, LOGICAL_SIZE));
        const paint = Skia.Paint();
        paint.setStyle(PaintStyle.Stroke);
        paint.setStrokeCap(StrokeCap.Round);
        paint.setStrokeJoin(StrokeJoin.Round);

        if (appendOnly && pictureCacheRef.current.picture) {
            canvas.drawPicture(pictureCacheRef.current.picture);
            for (let i = prevIds.length; i < strokes.length; i++) {
                const s = strokes[i];
                paint.setColor(Skia.Color(s.color));
                paint.setStrokeWidth(s.width);
                paint.setBlendMode(s.isEraser ? BlendMode.Clear : BlendMode.SrcOver);
                const path = s.skPath || pointsToPath(s.points);
                if (path) canvas.drawPath(path, paint);
            }
        } else {
            strokes.forEach(s => {
                paint.setColor(Skia.Color(s.color));
                paint.setStrokeWidth(s.width);
                paint.setBlendMode(s.isEraser ? BlendMode.Clear : BlendMode.SrcOver);
                const path = s.skPath || pointsToPath(s.points);
                if (path) canvas.drawPath(path, paint);
            });
        }

        const picture = recorder.finishRecordingAsPicture();
        pictureCacheRef.current = { picture, ids: nextIds };
        return picture;
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
                            const withPaths = parsed.map((s, idx) => ({
                                ...s,
                                id: s.id || `legacy-${idx}-${Date.now()}`,
                                skPath: pointsToPath(s.points) || undefined
                            }));
                            setStrokes(prev => {
                                if (pendingLocalWriteRef.current) return prev;
                                // Prevent brief server-lag snapshots from wiping fresh local strokes.
                                if (Date.now() - lastLocalStrokeAtRef.current < 2500 && withPaths.length < prev.length) {
                                    return prev;
                                }
                                return withPaths;
                            });
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
    }, [couple?.id, pointsToPath]);

    // ── RTDB: Listen for Partner's Active Stroke & Viewport ───────────────────
    useEffect(() => {
        if (!canUseCanvasRTDB) {
            partnerPath.value = Skia.Path.Make();
            partnerPointCount.value = 0;
            return;
        }
        if (!couple?.id || !profile?.id) return;
        const coupleBroadcastRef = ref(rtdb, `broadcasts/${couple.id}`);
        const unsub = onValue(coupleBroadcastRef, (snapshot) => {
            const allData = snapshot.val();
            if (!allData) return;

            Object.entries(allData).forEach(([senderId, data]: [string, any]) => {
                if (senderId === profile.id) return;
                const timestamp = Number(data?.timestamp || 0);
                if (timestamp <= (lastProcessedBySenderRef.current[senderId] || 0)) return;
                lastProcessedBySenderRef.current[senderId] = timestamp;

                // Discard stale packets (>1s old) to avoid rubber-banding on weak networks (Redmi 10)
                if (timestamp && Date.now() - timestamp > 1000) return;

                if (data?.event !== 'doodle_delta') return;
                const payload = data.payload || {};

                if (payload?.event === 'scroll-sync') {
                    const { s, tx, ty } = payload;
                    if (!isMirroring.value && typeof s === 'number' && typeof tx === 'number' && typeof ty === 'number') {
                        scale.value = withTiming(s, { duration: 100 });
                        translateX.value = withTiming(tx, { duration: 100 });
                        translateY.value = withTiming(ty, { duration: 100 });
                        savedScale.value = s;
                        savedTranslateX.value = tx;
                        savedTranslateY.value = ty;
                    }
                    return;
                }

                if (payload?.event === 'drawing-state' && payload.isDrawing === false) {
                    partnerPath.value = Skia.Path.Make();
                    partnerPointCount.value = 0;
                    return;
                }

                if (payload?.type === 'start') {
                    const meta = payload.meta || {};
                    const initialPoints = Array.isArray(payload.points) ? payload.points : [];
                    if (!payload.id || initialPoints.length === 0) return;

                    const stroke: Stroke = {
                        id: payload.id,
                        points: [...initialPoints],
                        color: meta.color || '#ffffff',
                        width: Number(meta.width || 3),
                        tool: meta.isEraser ? 'eraser' : 'pen',
                        isEraser: !!meta.isEraser,
                    };
                    remoteStrokesRef.current[payload.id] = stroke;

                    // UI Thread Path Start
                    partnerMeta.value = {
                        color: stroke.color,
                        width: stroke.width,
                        isEraser: stroke.isEraser || false
                    };
                    const newPath = Skia.Path.Make();
                    newPath.moveTo(initialPoints[0].x, initialPoints[0].y);
                    partnerPath.value = newPath;
                    partnerPointCount.value = 1;
                    return;
                }

                if (payload?.type === 'points' && payload.id && remoteStrokesRef.current[payload.id]) {
                    const nextPoints = Array.isArray(payload.points) ? payload.points : [];
                    if (nextPoints.length === 0) return;
                    const target = remoteStrokesRef.current[payload.id];
                    target.points.push(...nextPoints);

                    // Ultra-fast UI thread path append (Mali-G52 Optimization)
                    const updatedPath = partnerPath.value.copy();
                    nextPoints.forEach((p: Point) => {
                        const last = updatedPath.getLastPt();
                        const midX = (last.x + p.x) / 2;
                        const midY = (last.y + p.y) / 2;
                        updatedPath.quadTo(last.x, last.y, midX, midY);
                    });
                    partnerPath.value = updatedPath;
                    partnerPointCount.value = target.points.length;
                    return;
                }

                if (payload?.type === 'end' && payload.id && remoteStrokesRef.current[payload.id]) {
                    const finalized = remoteStrokesRef.current[payload.id];
                    delete remoteStrokesRef.current[payload.id];

                    // Reset Active Partner SharedValues
                    partnerPath.value = Skia.Path.Make();
                    partnerPointCount.value = 0;

                    setStrokes(prev => {
                        if (prev.some(s => s.id === finalized.id)) return prev;
                        return [...prev, {
                            ...finalized,
                            skPath: pointsToPath(finalized.points) || undefined
                        }];
                    });
                }
            });
        });
        return unsub;
    }, [canUseCanvasRTDB, couple?.id, profile?.id, pointsToPath]);

    const broadcastCanvasEvent = (payload: DeltaEventPayload) => {
        if (!canUseCanvasRTDB) return;
        if (!couple?.id || !profile?.id) return;
        const senderRef = ref(rtdb, `broadcasts/${couple.id}/${profile.id}`);
        rtdbSet(senderRef, {
            event: 'doodle_delta',
            payload,
            timestamp: Date.now(),
        });
    };

    const broadcastViewport = (s: number, tx: number, ty: number) => {
        if (!couple?.id || !profile?.id) return;
        const now = Date.now();
        if (now - lastViewportSyncAt.current > 120) {
            lastViewportSyncAt.current = now;
            broadcastCanvasEvent({ event: 'scroll-sync', s, tx, ty });
        }
    };

    // ── Drawing Actions ──────────────────────────────────────────────────────
    useEffect(() => {
        if (!canUseCanvasRTDB) return;
        if (!couple?.id || !profile?.id) return;
        const broadcastRef = ref(rtdb, `broadcasts/${couple.id}/${profile.id}`);
        onDisconnect(broadcastRef).remove();
    }, [canUseCanvasRTDB, couple?.id, profile?.id]);

    const broadcastDelta = (payload: DeltaEventPayload) => {
        broadcastCanvasEvent(payload);
    };

    const persistStrokesNow = useCallback(async (nextStrokes: Stroke[]) => {
        if (!couple?.id) return;
        try {
            await setDoc(doc(db, 'couples', couple.id, 'doodles', 'latest'), {
                couple_id: couple.id,
                user_id: profile?.id,
                path_data: JSON.stringify(nextStrokes),
                updated_at: serverTimestamp()
            });
        } finally {
            pendingLocalWriteRef.current = false;
        }
    }, [couple?.id, profile?.id]);

    const schedulePersist = useCallback((nextStrokes: Stroke[]) => {
        if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
        persistTimerRef.current = setTimeout(() => {
            persistTimerRef.current = null;
            void persistStrokesNow(nextStrokes);
        }, FIRESTORE_PERSIST_MS);
    }, [persistStrokesNow]);

    useEffect(() => {
        return () => {
            if (persistTimerRef.current) {
                clearTimeout(persistTimerRef.current);
                persistTimerRef.current = null;
                void persistStrokesNow(latestStrokesRef.current);
            }
        };
    }, [persistStrokesNow]);

    const startDrawing = (x: number, y: number) => {
        if (!canDraw) return;
        isDrawingRef.current = true;
        if (ENABLE_DEBUG_CHIP) setDebugIsDrawing(true);
        lastDrawPointRef.current = { x, y };
        const strokeId = `${profile?.id || 'local'}-${Date.now()}`;
        currentStrokeIdRef.current = strokeId;
        syncedPointCountRef.current = 1;
        const firstPoint = { x, y };
        currentPoints.current = [firstPoint];
        broadcastDelta({
            type: 'start',
            id: strokeId,
            points: [quantizePoint(firstPoint)],
            meta: {
                color: activeTool === 'eraser' ? '#070707' : activeColor,
                width: activeTool === 'eraser' ? 20 : 3,
                isEraser: activeTool === 'eraser',
            },
        });
        broadcastDelta({ event: 'drawing-state', isDrawing: true });
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    };

    const continueDrawing = (x: number, y: number) => {
        if (!canDraw || !isDrawingRef.current) return;
        if (ENABLE_DEBUG_CHIP) setDebugTouchEvents(prev => prev + 1);
        const last = currentPoints.current[currentPoints.current.length - 1];
        const dist = Math.hypot(x - last.x, y - last.y);
        if (dist < REDMI12_POINT_MIN_DIST) return; // Point-density cap for Redmi 12

        currentPoints.current.push({ x, y });
        lastDrawPointRef.current = { x, y };

        // Throttle RTDB broadcasts for fluidity and bandwidth.
        const now = Date.now();
        if (now - lastDeltaSyncAt.current > LOW_LATENCY_SYNC_MS && currentStrokeIdRef.current) {
            lastDeltaSyncAt.current = now;
            const unsyncedPoints = currentPoints.current.slice(syncedPointCountRef.current);
            if (unsyncedPoints.length > 0) {
                syncedPointCountRef.current = currentPoints.current.length;
                broadcastDelta({
                    type: 'points',
                    id: currentStrokeIdRef.current,
                    points: unsyncedPoints.map(quantizePoint),
                });
            }
        }

    };

    const flushPendingStrokePoints = () => {
        if (!currentStrokeIdRef.current) return;
        const unsyncedPoints = currentPoints.current.slice(syncedPointCountRef.current);
        if (unsyncedPoints.length === 0) return;
        syncedPointCountRef.current = currentPoints.current.length;
        broadcastDelta({
            type: 'points',
            id: currentStrokeIdRef.current,
            points: unsyncedPoints.map(quantizePoint),
        });
    };

    const endDrawing = () => {
        if (!isDrawingRef.current || !couple?.id) return;
        isDrawingRef.current = false;
        if (ENABLE_DEBUG_CHIP) setDebugIsDrawing(false);
        lastDrawPointRef.current = null;
        flushPendingStrokePoints();

        const strokeId = currentStrokeIdRef.current || `${profile?.id || 'local'}-${Date.now()}`;
        const finalStroke: Stroke = {
            id: strokeId,
            points: [...currentPoints.current],
            color: activeTool === 'eraser' ? '#070707' : activeColor,
            width: activeTool === 'eraser' ? 20 : 3,
            tool: activeTool === 'eraser' ? 'eraser' : 'pen',
            isEraser: activeTool === 'eraser',
            skPath: pointsToPath(currentPoints.current) || undefined
        };

        if (finalStroke.points.length < 2) {
            activePath.value = Skia.Path.Make();
            currentPoints.current = [];
            currentStrokeIdRef.current = null;
            syncedPointCountRef.current = 0;
            broadcastDelta({ event: 'drawing-state', isDrawing: false });
            if (ENABLE_DEBUG_CHIP) setDebugIsDrawing(false);
            return;
        }

        const updated = [...strokes, finalStroke];
        pendingLocalWriteRef.current = true;
        lastLocalStrokeAtRef.current = Date.now();
        setStrokes(updated);
        broadcastDelta({ type: 'end', id: strokeId });
        broadcastDelta({ event: 'drawing-state', isDrawing: false });

        // Reset local path state after a short delay to prevent flicker/disappearance
        // while React re-renders the backgroundPicture with the new stroke.
        setTimeout(() => {
            activePath.value = Skia.Path.Make();
            currentPoints.current = [];
            currentStrokeIdRef.current = null;
            syncedPointCountRef.current = 0;
            if (ENABLE_DEBUG_CHIP) setDebugIsDrawing(false);
        }, 60);

        schedulePersist(updated);
    };

    const mapLocalPointToLogical = (localX: number, localY: number) => {
        if (SIMPLE_NATIVE_CANVAS) {
            return {
                x: Math.max(0, Math.min(CANVAS_WIDTH, localX)),
                y: Math.max(0, Math.min(480, localY)),
            };
        }
        const s = scale.value * (SCREEN_WIDTH / LOGICAL_SIZE);
        const logicalX = (localX - translateX.value) / s;
        const logicalY = (localY - translateY.value) / s;
        return {
            x: Math.max(0, Math.min(LOGICAL_SIZE, logicalX)),
            y: Math.max(0, Math.min(LOGICAL_SIZE, logicalY)),
        };
    };

    useEffect(() => {
        if (SIMPLE_NATIVE_CANVAS) return;
        if (canvasMode !== 'draw') return;
        // Keep draw mode deterministic: no inherited viewport offsets.
        scale.value = 1;
        savedScale.value = 1;
        translateX.value = 0;
        translateY.value = 0;
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
    }, [canvasMode, savedScale, savedTranslateX, savedTranslateY, scale, translateX, translateY]);

    // ── Gestures: Drawing + Zoom + Pan ───────────────────────────────────────
    const drawingGesture = Gesture.Pan()
        .enabled(canDraw)
        .maxPointers(1)
        .onBegin((e) => {
            'worklet';
            isDrawing.value = true;
            const x = e.x;
            const y = e.y;
            // Always start a fresh live preview path for each new stroke.
            activePath.value = Skia.Path.Make();
            activePath.value.moveTo(x, y);
            uiLastX.value = x;
            uiLastY.value = y;
            uiHasPoint.value = true;
            lastJsDispatchAt.value = Date.now();
            runOnJS(startDrawing)(x, y);
        })
        .onUpdate((e) => {
            'worklet';
            const x = e.x;
            const y = e.y;

            if (SIMPLE_NATIVE_CANVAS) {
                if (!uiHasPoint.value) {
                    const nextPath = activePath.value.copy();
                    nextPath.moveTo(x, y);
                    activePath.value = nextPath;
                    uiHasPoint.value = true;
                } else {
                    const dx = x - uiLastX.value;
                    const dy = y - uiLastY.value;
                    const jump = Math.hypot(dx, dy);
                    if (jump > LIVE_PATH_MAX_JUMP_PX) {
                        const nextPath = activePath.value.copy();
                        nextPath.moveTo(x, y);
                        activePath.value = nextPath;
                    } else {
                        const nextPath = activePath.value.copy();
                        nextPath.lineTo(x, y);
                        activePath.value = nextPath;
                    }
                }
                uiLastX.value = x;
                uiLastY.value = y;
            } else {
                const nextPath = activePath.value.copy();
                const last = nextPath.getLastPt();
                const midX = (last.x + x) / 2;
                const midY = (last.y + y) / 2;
                nextPath.quadTo(last.x, last.y, midX, midY);
                activePath.value = nextPath;
            }
            const now = Date.now();
            if (now - lastJsDispatchAt.value >= JS_POINT_DISPATCH_MS) {
                lastJsDispatchAt.value = now;
                runOnJS(continueDrawing)(x, y);
            }
        })
        .onEnd(() => {
            'worklet';
            isDrawing.value = false;
            uiHasPoint.value = false;
            runOnJS(endDrawing)();
        })
        .onFinalize(() => {
            'worklet';
            if (isDrawing.value) {
                isDrawing.value = false;
                uiHasPoint.value = false;
                runOnJS(endDrawing)();
            }
        })
        .minDistance(0);

    const pinchGesture = Gesture.Pinch()
        .enabled(isPanMode)
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
        .enabled(isPanMode)
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
        if (canvasMode === 'readOnly' || strokes.length === 0 || !couple?.id) return;
        const last = strokes[strokes.length - 1];
        setRedoStrokes(prev => [...prev, last]);
        const next = strokes.slice(0, -1);
        pendingLocalWriteRef.current = true;
        lastLocalStrokeAtRef.current = Date.now();
        setStrokes(next);
        if (persistTimerRef.current) {
            clearTimeout(persistTimerRef.current);
            persistTimerRef.current = null;
        }
        await persistStrokesNow(next);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    };

    const handleRedo = async () => {
        if (canvasMode === 'readOnly' || redoStrokes.length === 0 || !couple?.id) return;
        const last = redoStrokes[redoStrokes.length - 1];
        setRedoStrokes(prev => prev.slice(0, -1));
        const next = [...strokes, last];
        pendingLocalWriteRef.current = true;
        lastLocalStrokeAtRef.current = Date.now();
        setStrokes(next);
        if (persistTimerRef.current) {
            clearTimeout(persistTimerRef.current);
            persistTimerRef.current = null;
        }
        await persistStrokesNow(next);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    };

    const handleClearCanvas = async () => {
        if (!couple?.id) return;
        lastLocalStrokeAtRef.current = Date.now();
        pendingLocalWriteRef.current = true;
        setStrokes([]);
        if (persistTimerRef.current) {
            clearTimeout(persistTimerRef.current);
            persistTimerRef.current = null;
        }
        await persistStrokesNow([]);

        // Clear active remote drawing indicator.
        broadcastDelta({ event: 'drawing-state', isDrawing: false });

        setShowClearConfirm(false);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    };

    useEffect(() => {
        if (!FORCE_CANVAS_RESET_ONCE) return;
        if (!couple?.id || didAutoResetRef.current) return;
        didAutoResetRef.current = true;
        void handleClearCanvas();
    }, [couple?.id]);

    const handleDownload = async () => {
        if (!canvasRef.current) return;
        const image = canvasRef.current.makeImageSnapshot();
        if (image) {
            const base64 = image.encodeToBase64();
            // @ts-ignore
            const uri = `${FileSystem.cacheDirectory}orbit-doodle-${Date.now()}.png`;
            await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
            // Android: request photo/media-image permission only to avoid audio permission rejection.
            const { status } = await MediaLibrary.requestPermissionsAsync(true);
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
                <View
                    ref={drawingAreaRef}
                    style={styles.drawingArea}
                    pointerEvents={canDraw ? "auto" : "none"}
                    onLayout={() => {
                        drawingAreaRef.current?.measureInWindow((x, y, width, height) => {
                            drawingAreaBoundsRef.current = { x, y, width, height };
                        });
                    }}
                >
                    <Canvas ref={canvasRef} style={StyleSheet.absoluteFill}>
                        {SIMPLE_NATIVE_CANVAS ? (
                            <>
                                <Picture picture={backgroundPicture} />

                                {/* Partner Active Stroke (Zero Re-render Layer) */}
                                <Path
                                    path={partnerPath}
                                    color={partnerMeta.value.color}
                                    style="stroke"
                                    strokeWidth={partnerMeta.value.width}
                                    strokeCap="round"
                                    strokeJoin="round"
                                />

                                <Path
                                    path={activePath}
                                    color={activeTool === 'eraser' ? '#070707' : activeColor}
                                    style="stroke"
                                    strokeWidth={activeTool === 'eraser' ? 20 : 3}
                                    strokeCap="round"
                                    strokeJoin="round"
                                />
                            </>
                        ) : (
                            <Group transform={useAnimatedStyle(() => ({
                                transform: [
                                    { translateX: translateX.value },
                                    { translateY: translateY.value },
                                    { scale: scale.value * (SCREEN_WIDTH / LOGICAL_SIZE) },
                                ]
                            })).transform}>
                                <Picture picture={backgroundPicture} />

                                <Path
                                    path={partnerPath}
                                    color={partnerMeta.value.color}
                                    style="stroke"
                                    strokeWidth={partnerMeta.value.width}
                                    strokeCap="round"
                                    strokeJoin="round"
                                />

                                <Path
                                    path={activePath}
                                    color={activeTool === 'eraser' ? '#070707' : activeColor}
                                    style="stroke"
                                    strokeWidth={activeTool === 'eraser' ? 20 : 3}
                                    strokeCap="round"
                                    strokeJoin="round"
                                />
                            </Group>
                        )}
                    </Canvas>

                    {isShieldMode && (
                        <View style={styles.shieldOverlay} pointerEvents="none">
                            <Text style={styles.shieldText}>SHIELD ACTIVE • VIEW ONLY</Text>
                        </View>
                    )}

                </View>
            </GestureDetector>

            {ENABLE_DEBUG_CHIP && (
                <View style={styles.debugChip} pointerEvents="none">
                    <Text style={styles.debugText}>
                        {`mode:${canvasMode} tool:${activeTool} draw:${canDraw ? '1' : '0'} pan:${isPanMode ? '1' : '0'} down:${debugIsDrawing ? '1' : '0'} ev:${debugTouchEvents}`}
                    </Text>
                </View>
            )}

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
                            setCanvasMode('pan');
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
                        <View style={styles.sliderRow}>
                            <View style={[styles.colorPreview, { backgroundColor: activeColor }]} />
                            <GestureDetector gesture={Gesture.Pan().onUpdate((e) => {
                                rainbowPosition.value = Math.max(0, Math.min(1, e.x / 140));
                                const hue = rainbowPosition.value * 359;
                                runOnJS(setActiveColor)(hueToHex(hue));
                            })}>
                                <View style={styles.rainbowTrack}>
                                    <Canvas style={StyleSheet.absoluteFill}>
                                        <Rect x={0} y={0} width={140} height={10}>
                                            <LinearGradient
                                                start={vec(0, 0)}
                                                end={vec(140, 0)}
                                                colors={['#f00', '#ff0', '#0f0', '#0ff', '#00f', '#f0f', '#f00']}
                                            />
                                        </Rect>
                                    </Canvas>
                                    <Animated.View style={[styles.pickerThumb, thumbAnimatedStyle]} />
                                </View>
                            </GestureDetector>
                        </View>
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
                                    if (canvasMode === 'readOnly' || !couple?.id) return;
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
                                style={[styles.menuIconBtn, canvasMode === 'pan' && styles.activeMenuBtn]}
                                onPress={() => {
                                    const nextMode = canvasMode === 'pan' ? 'draw' : 'pan';
                                    setCanvasMode(nextMode);
                                    if (nextMode === 'draw') setActiveTool('pen');
                                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                                }}
                            >
                                {canvasMode === 'pan' ? (
                                    <Edit2 size={14} color="white" />
                                ) : (
                                    <Move size={14} color="white" />
                                )}
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[styles.menuIconBtn, activeTool === 'eraser' && styles.activeMenuBtn]}
                                onPress={() => {
                                    setActiveTool('eraser');
                                    setCanvasMode('draw');
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
                                        setCanvasMode('draw');
                                        setShowColorPicker(false);
                                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                    }}
                                    style={[styles.colorDot, { backgroundColor: c }, activeColor === c && activeTool === 'pen' && styles.activeDot]}
                                />
                            ))}
                        </Animated.View>
                    )}

                    {!isMenuOpen && (
                        <View style={styles.fabColumn}>
                            <View style={[styles.fabBlur, { backgroundColor: 'rgba(15,15,15,0.9)' }]}>
                                <TouchableOpacity
                                    style={styles.mainFab}
                                    onPress={() => {
                                        if (canvasMode === 'readOnly') {
                                            setCanvasMode('draw');
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

                            <View style={[styles.fabBlur, { backgroundColor: 'rgba(15,15,15,0.9)' }]}>
                                <TouchableOpacity
                                    style={styles.mainFab}
                                    onPress={handleSaveToGallery}
                                >
                                    <Download size={20} color="white" />
                                </TouchableOpacity>
                            </View>
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
    fabColumn: {
        flexDirection: 'column',
        gap: 12,
        alignItems: 'center',
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
        width: 210,
        backgroundColor: 'rgba(15, 15, 15, 0.95)',
        padding: 12,
        borderRadius: 100,
        borderWidth: 1.2,
        borderColor: 'rgba(255,255,255,0.15)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 10,
        marginBottom: 12,
        marginRight: 10,
    },
    sliderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    colorPreview: {
        width: 24,
        height: 24,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: 'rgba(255,255,255,0.2)',
    },
    rainbowTrack: {
        height: 10,
        width: 140,
        borderRadius: 5,
        overflow: 'hidden',
        backgroundColor: '#333',
    },
    pickerThumb: {
        position: 'absolute',
        top: -6,
        left: -11, // Centering for 22px width thumb
        width: 22,
        height: 22,
        borderRadius: 11,
        backgroundColor: 'white',
        borderWidth: 2,
        borderColor: 'white',
        elevation: 10,
        shadowColor: 'black',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.4,
        shadowRadius: 5,
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
    debugChip: {
        position: 'absolute',
        top: 58,
        right: 14,
        zIndex: 300,
        backgroundColor: 'rgba(0,0,0,0.75)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.18)',
        borderRadius: 10,
        paddingHorizontal: 8,
        paddingVertical: 5,
    },
    debugText: {
        color: '#fff',
        fontSize: 10,
        fontFamily: Typography.sansBold,
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
