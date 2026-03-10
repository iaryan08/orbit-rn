import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Dimensions, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  BlendMode,
  Canvas,
  Group,
  ImageFormat,
  PaintStyle,
  Path,
  Picture,
  Skia,
  StrokeCap,
  StrokeJoin,
  type SkPath,
  useCanvasRef,
} from '@shopify/react-native-skia';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { onDisconnect, onValue, ref, set as rtdbSet } from 'firebase/database';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { Download, Edit2, Eraser, Move, Redo2, Shield, ShieldOff, Trash2, Undo2, X } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system/legacy';
import { db, rtdb } from '../lib/firebase';
import { useOrbitStore } from '../lib/store';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CANVAS_HEIGHT = Math.round(SCREEN_WIDTH * 1.2);
const LOGICAL_SIZE = 1500;
const PEN_WIDTH = 3;
const ERASER_WIDTH = 22;
const MIN_POINT_DIST_SCREEN_PX = 0.8;
const MAX_JUMP_SCREEN_PX = 80;
const BRIDGE_STEP_SCREEN_PX = 24;
const HARD_DROP_SCREEN_PX = 360;
const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
const DELTA_SYNC_MS = 50;
const FAST_DELTA_SYNC_MS = 33;
const MAX_POINTS_PER_DELTA = 18;
const POINT_PRECISION = 10;
const MAX_STROKES = 500;
const PRESET_COLORS = ['#ffffff', '#fb7185', '#a855f7'];

interface Point {
  x: number;
  y: number;
}

interface Stroke {
  id: string;
  points: Point[];
  path: SkPath;
  color: string;
  width: number;
  isEraser: boolean;
}

interface StrokeMeta {
  color: string;
  width: number;
  isEraser: boolean;
}

type DeltaPayload =
  | { type: 'start'; id: string; points: Point[]; meta: StrokeMeta }
  | { type: 'points'; id: string; points: Point[] }
  | { type: 'end'; id: string };
type InteractionMode = 'draw' | 'pan' | 'shield';

const quantizePoint = (p: Point): Point => ({
  x: Math.round(p.x * POINT_PRECISION) / POINT_PRECISION,
  y: Math.round(p.y * POINT_PRECISION) / POINT_PRECISION,
});

const hueToHex = (h: number): string => {
  const s = 0.95;
  const l = 0.55;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const b = l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
    return Math.round(255 * b)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
};

const pointsToPath = (points: Point[]): SkPath | null => {
  if (points.length < 2) return null;
  const path = Skia.Path.Make();
  path.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length - 1; i += 1) {
    const midX = (points[i].x + points[i + 1].x) / 2;
    const midY = (points[i].y + points[i + 1].y) / 2;
    path.quadTo(points[i].x, points[i].y, midX, midY);
  }
  path.lineTo(points[points.length - 1].x, points[points.length - 1].y);
  return path;
};

export function SharedCanvas() {
  const { couple, profile, setPagerScrollEnabled, activeTabIndex } = useOrbitStore();
  const canvasRef = useCanvasRef();

  const [committedStrokes, setCommittedStrokes] = useState<Stroke[]>([]);
  const [redoStrokes, setRedoStrokes] = useState<Stroke[]>([]);
  const [activeTool, setActiveTool] = useState<'pen' | 'eraser'>('pen');
  const [activeColor, setActiveColor] = useState(PRESET_COLORS[1]);
  const [pickerSlotColor, setPickerSlotColor] = useState(PRESET_COLORS[2]);
  const [pickerHue, setPickerHue] = useState(320);
  const [pickerWidth, setPickerWidth] = useState(140);
  const [showHuePicker, setShowHuePicker] = useState(false);
  const [interactionMode, setInteractionMode] = useState<InteractionMode>('shield');
  const [showToolsUi, setShowToolsUi] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const activePath = useSharedValue(Skia.Path.Make());
  const handoffPath = useSharedValue(Skia.Path.Make());
  const handoffColor = useSharedValue(PRESET_COLORS[1]);
  const handoffWidth = useSharedValue(PEN_WIDTH);
  const handoffIsEraser = useSharedValue(false);
  const canvasWidth = useSharedValue(SCREEN_WIDTH);
  const canvasHeight = useSharedValue(CANVAS_HEIGHT);
  const scrollX = useSharedValue(0);
  const scrollY = useSharedValue(0);
  const zoomScale = useSharedValue(1);
  const zoomTx = useSharedValue(0);
  const zoomTy = useSharedValue(0);
  const savedZoomScale = useSharedValue(1);
  const savedZoomTx = useSharedValue(0);
  const savedZoomTy = useSharedValue(0);
  const hueThumbX = useSharedValue(0);
  const lastHueSyncAt = useSharedValue(0);
  const uiLastX = useSharedValue(0);
  const uiLastY = useSharedValue(0);

  const localPointsRef = useRef<Point[]>([]);
  const localMetaRef = useRef<StrokeMeta>({ color: activeColor, width: PEN_WIDTH, isEraser: false });
  const currentStrokeIdRef = useRef<string | null>(null);
  const syncedPointCountRef = useRef(0);
  const lastDeltaSyncAtRef = useRef(0);
  const handoffClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const remoteStrokeRef = useRef<Record<string, { id: string; points: Point[]; meta: StrokeMeta }>>({});
  const lastProcessedBySenderRef = useRef<Record<string, number>>({});

  const mapLocalPointToLogical = useCallback(
    (localX: number, localY: number): Point => {
      'worklet';
      const clampedX = Math.max(0, Math.min(canvasWidth.value || SCREEN_WIDTH, localX));
      const clampedY = Math.max(0, Math.min(canvasHeight.value || CANVAS_HEIGHT, localY));
      const zx = (clampedX - zoomTx.value) / (zoomScale.value || 1);
      const zy = (clampedY - zoomTy.value) / (zoomScale.value || 1);
      const lx = zx + scrollX.value;
      const ly = zy + scrollY.value;
      return {
        x: Math.max(0, Math.min(LOGICAL_SIZE, lx)),
        y: Math.max(0, Math.min(LOGICAL_SIZE, ly)),
      };
    },
    [canvasHeight, canvasWidth, scrollX, scrollY, zoomScale, zoomTx, zoomTy],
  );

  const syncLegacyWeb = useCallback(
    async (nextStrokes: Stroke[]) => {
      if (!couple?.id) return;
      const legacyRef = doc(db, 'couples', couple.id, 'doodles', 'latest');
      const payload = nextStrokes.map((s) => ({
        id: s.id,
        points: s.points,
        color: s.color,
        width: s.width,
        isEraser: s.isEraser,
      }));
      await setDoc(
        legacyRef,
        {
          path_data: JSON.stringify(payload),
          updated_at: serverTimestamp(),
          user_id: profile?.id || '',
        },
        { merge: true },
      );
    },
    [couple?.id, profile?.id],
  );

  const broadcastDelta = useCallback(
    (payload: DeltaPayload) => {
      if (!couple?.id || !profile?.id) return;
      const senderRef = ref(rtdb, `broadcasts/${couple.id}/${profile.id}`);
      rtdbSet(senderRef, {
        event: 'doodle_delta',
        payload,
        timestamp: Date.now(),
      });
    },
    [couple?.id, profile?.id],
  );

  const clearLocalBroadcast = useCallback(async () => {
    if (!couple?.id || !profile?.id) return;
    const senderRef = ref(rtdb, `broadcasts/${couple.id}/${profile.id}`);
    await rtdbSet(senderRef, null);
  }, [couple?.id, profile?.id]);

  useEffect(() => {
    if (!couple?.id || !profile?.id) return;
    const selfRef = ref(rtdb, `broadcasts/${couple.id}/${profile.id}`);
    onDisconnect(selfRef).remove();
  }, [couple?.id, profile?.id]);

  useEffect(() => {
    if (!couple?.id || !profile?.id) return;
    const coupleBroadcastRef = ref(rtdb, `broadcasts/${couple.id}`);

    const unsub = onValue(coupleBroadcastRef, (snapshot) => {
      const all = snapshot.val();
      if (!all) return;

      Object.entries(all).forEach(([senderId, packet]: [string, any]) => {
        if (senderId === profile.id) return;
        if (packet?.event !== 'doodle_delta') return;

        const timestamp = Number(packet?.timestamp || 0);
        if (timestamp <= (lastProcessedBySenderRef.current[senderId] || 0)) return;
        lastProcessedBySenderRef.current[senderId] = timestamp;

        const payload = packet?.payload as DeltaPayload | undefined;
        if (!payload) return;

        if (payload.type === 'start') {
          remoteStrokeRef.current[payload.id] = {
            id: payload.id,
            points: Array.isArray(payload.points) ? [...payload.points] : [],
            meta: {
              color: payload.meta?.color || PRESET_COLORS[1],
              width: Number(payload.meta?.width || PEN_WIDTH),
              isEraser: !!payload.meta?.isEraser,
            },
          };
          return;
        }

        if (payload.type === 'points') {
          const target = remoteStrokeRef.current[payload.id];
          if (!target || !Array.isArray(payload.points) || payload.points.length === 0) return;
          target.points.push(...payload.points);
          return;
        }

        if (payload.type === 'end') {
          const finalStroke = remoteStrokeRef.current[payload.id];
          if (!finalStroke) return;
          delete remoteStrokeRef.current[payload.id];

          const path = pointsToPath(finalStroke.points);
          if (!path) return;

          setCommittedStrokes((prev) => {
            if (prev.some((s) => s.id === finalStroke.id)) return prev;
            const next: Stroke[] = [
              ...prev,
              {
                id: finalStroke.id,
                points: finalStroke.points,
                path,
                color: finalStroke.meta.color,
                width: finalStroke.meta.width,
                isEraser: finalStroke.meta.isEraser,
              },
            ];
            return next.length > MAX_STROKES ? next.slice(next.length - MAX_STROKES) : next;
          });
        }
      });
    });

    return unsub;
  }, [couple?.id, profile?.id]);

  const startDrawing = useCallback(
    (x: number, y: number) => {
      const strokeId = `${profile?.id || 'local'}-${Date.now()}`;
      const isEraser = activeTool === 'eraser';
      const meta: StrokeMeta = {
        color: isEraser ? '#000000' : activeColor,
        width: isEraser ? ERASER_WIDTH : PEN_WIDTH,
        isEraser,
      };

      localMetaRef.current = meta;
      currentStrokeIdRef.current = strokeId;
      localPointsRef.current = [{ x, y }];
      syncedPointCountRef.current = 1;
      lastDeltaSyncAtRef.current = Date.now();

      broadcastDelta({
        type: 'start',
        id: strokeId,
        points: [quantizePoint({ x, y })],
        meta,
      });
    },
    [activeColor, activeTool, broadcastDelta, profile?.id],
  );

  const continueDrawing = useCallback(
    (x: number, y: number) => {
      localPointsRef.current.push({ x, y });

      const now = Date.now();
      if (!currentStrokeIdRef.current) return;
      const unsyncedCount = localPointsRef.current.length - syncedPointCountRef.current;
      const syncInterval = unsyncedCount > MAX_POINTS_PER_DELTA ? FAST_DELTA_SYNC_MS : DELTA_SYNC_MS;
      if (now - lastDeltaSyncAtRef.current < syncInterval) return;
      lastDeltaSyncAtRef.current = now;

      const unsynced = localPointsRef.current.slice(syncedPointCountRef.current);
      if (unsynced.length === 0) return;

      const chunk = unsynced.slice(0, MAX_POINTS_PER_DELTA);
      syncedPointCountRef.current += chunk.length;
      broadcastDelta({
        type: 'points',
        id: currentStrokeIdRef.current,
        points: chunk.map(quantizePoint),
      });
    },
    [broadcastDelta],
  );

  const endDrawing = useCallback(() => {
    const strokeId = currentStrokeIdRef.current;
    if (!strokeId) return;

    const unsynced = localPointsRef.current.slice(syncedPointCountRef.current);
    if (unsynced.length > 0) {
      const points = unsynced.map(quantizePoint);
      for (let i = 0; i < points.length; i += MAX_POINTS_PER_DELTA) {
        const chunk = points.slice(i, i + MAX_POINTS_PER_DELTA);
        if (chunk.length === 0) continue;
        broadcastDelta({
          type: 'points',
          id: strokeId,
          points: chunk,
        });
      }
    }
    broadcastDelta({ type: 'end', id: strokeId });

    const finalPoints = [...localPointsRef.current];
    const path = pointsToPath(finalPoints);
    if (path) {
      setCommittedStrokes((prev) => {
        const next: Stroke[] = [
          ...prev,
          {
            id: strokeId,
            points: finalPoints,
            path,
            color: localMetaRef.current.color,
            width: localMetaRef.current.width,
            isEraser: localMetaRef.current.isEraser,
          },
        ];
        const capped = next.length > MAX_STROKES ? next.slice(next.length - MAX_STROKES) : next;
        void syncLegacyWeb(capped).then(() => clearLocalBroadcast());
        return capped;
      });
      setRedoStrokes([]);
    }

    // Keep a tiny UI-thread buffer during commit to avoid a one-frame blink.
    handoffPath.value = activePath.value.copy();
    handoffColor.value = localMetaRef.current.color;
    handoffWidth.value = localMetaRef.current.width;
    handoffIsEraser.value = localMetaRef.current.isEraser;

    if (handoffClearTimerRef.current) clearTimeout(handoffClearTimerRef.current);
    handoffClearTimerRef.current = setTimeout(() => {
      handoffPath.value = Skia.Path.Make();
    }, 110);

    currentStrokeIdRef.current = null;
    syncedPointCountRef.current = 0;
    localPointsRef.current = [];
    activePath.value = Skia.Path.Make();
  }, [activePath, broadcastDelta, clearLocalBroadcast, handoffColor, handoffIsEraser, handoffPath, handoffWidth, syncLegacyWeb]);

  const handleUndo = useCallback(() => {
    setCommittedStrokes((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setRedoStrokes((redo) => [...redo, last]);
      const next = prev.slice(0, -1);
      void syncLegacyWeb(next).then(() => clearLocalBroadcast());
      return next;
    });
  }, [clearLocalBroadcast, syncLegacyWeb]);

  const handleRedo = useCallback(() => {
    setRedoStrokes((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setCommittedStrokes((curr) => {
        const next = [...curr, last];
        void syncLegacyWeb(next).then(() => clearLocalBroadcast());
        return next;
      });
      return prev.slice(0, -1);
    });
  }, [clearLocalBroadcast, syncLegacyWeb]);

  const handleClear = useCallback(() => {
    setCommittedStrokes([]);
    setRedoStrokes([]);
    activePath.value = Skia.Path.Make();
    void syncLegacyWeb([]).then(() => clearLocalBroadcast());
    setShowClearConfirm(false);
  }, [activePath, clearLocalBroadcast, syncLegacyWeb]);

  const handleDownload = useCallback(async () => {
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync(true);
      if (status !== 'granted') {
        Alert.alert('Permission', 'Please allow photo access to save drawings.');
        return;
      }

      const image = canvasRef.current?.makeImageSnapshot();
      if (!image) return;

      const base64 = image.encodeToBase64(ImageFormat.PNG, 100);
      const uri = `${FileSystem.cacheDirectory}orbit-doodle-${Date.now()}.png`;
      await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 });
      await MediaLibrary.saveToLibraryAsync(uri);
      Alert.alert('Saved', 'Drawing saved to gallery.');
    } catch {
      Alert.alert('Error', 'Could not save drawing.');
    }
  }, [canvasRef]);

  const isDrawMode = interactionMode === 'draw';
  const isPanMode = interactionMode === 'pan';
  const isShieldMode = interactionMode === 'shield';
  const enterShieldMode = useCallback(() => {
    setInteractionMode('shield');
    setShowToolsUi(false);
    setShowHuePicker(false);
    setShowClearConfirm(false);
    zoomScale.value = 1;
    zoomTx.value = 0;
    zoomTy.value = 0;
    savedZoomScale.value = 1;
    savedZoomTx.value = 0;
    savedZoomTy.value = 0;
  }, []);
  const updateColorFromTrack = useCallback(
    (x: number) => {
      const clampedX = Math.max(0, Math.min(pickerWidth, x));
      const hue = (clampedX / (pickerWidth || 1)) * 360;
      const color = hueToHex(hue);
      setPickerHue(hue);
      setPickerSlotColor(color);
      setInteractionMode('draw');
      setActiveTool('pen');
      setActiveColor(color);
    },
    [pickerWidth],
  );
  const hueThumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: hueThumbX.value }],
  }));
  const zoomCanvasStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: zoomTx.value },
      { translateY: zoomTy.value },
      { scaleX: zoomScale.value },
      { scaleY: zoomScale.value },
    ],
  }));
  useEffect(() => {
    const x = Math.max(0, Math.min(pickerWidth - 14, (pickerHue / 360) * pickerWidth - 7));
    hueThumbX.value = x;
  }, [pickerHue, pickerWidth, hueThumbX]);
  const hueGesture = Gesture.Pan()
    .minDistance(0)
    .onBegin((e) => {
      'worklet';
      const x = Math.max(0, Math.min(pickerWidth - 14, e.x - 7));
      hueThumbX.value = x;
      lastHueSyncAt.value = 0;
      runOnJS(updateColorFromTrack)(x + 7);
    })
    .onUpdate((e) => {
      'worklet';
      const x = Math.max(0, Math.min(pickerWidth - 14, e.x - 7));
      hueThumbX.value = x;
      const now = Date.now();
      if (now - lastHueSyncAt.value > 24) {
        lastHueSyncAt.value = now;
        runOnJS(updateColorFromTrack)(x + 7);
      }
    })
    .onEnd((e) => {
      'worklet';
      const x = Math.max(0, Math.min(pickerWidth - 14, e.x - 7));
      hueThumbX.value = x;
      runOnJS(updateColorFromTrack)(x + 7);
    });

  const pinchGesture = Gesture.Pinch()
    .enabled(isDrawMode)
    .onBegin((e) => {
      'worklet';
      savedZoomScale.value = zoomScale.value;
      savedZoomTx.value = zoomTx.value;
      savedZoomTy.value = zoomTy.value;
    })
    .onUpdate((e) => {
      'worklet';
      const nextScale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, savedZoomScale.value * e.scale));
      const focalX = e.focalX;
      const focalY = e.focalY;
      const worldX = (focalX - savedZoomTx.value) / (savedZoomScale.value || 1);
      const worldY = (focalY - savedZoomTy.value) / (savedZoomScale.value || 1);
      zoomScale.value = nextScale;
      zoomTx.value = focalX - worldX * nextScale;
      zoomTy.value = focalY - worldY * nextScale;
    })
    .onEnd(() => {
      'worklet';
      savedZoomScale.value = zoomScale.value;
      savedZoomTx.value = zoomTx.value;
      savedZoomTy.value = zoomTy.value;
    });
  const commitPickerSlotColor = useCallback(() => {
    setInteractionMode('draw');
    setActiveColor(pickerSlotColor);
    setActiveTool('pen');
  }, [pickerSlotColor]);

  const drawingGesture = Gesture.Pan()
    .enabled(isDrawMode)
    .minDistance(0)
    .maxPointers(1)
    .onBegin((e) => {
      'worklet';
      const p = mapLocalPointToLogical(e.x, e.y);
      const path = Skia.Path.Make();
      path.moveTo(p.x, p.y);
      activePath.value = path;
      uiLastX.value = p.x;
      uiLastY.value = p.y;
      runOnJS(startDrawing)(p.x, p.y);
    })
    .onUpdate((e) => {
      'worklet';
      const p = mapLocalPointToLogical(e.x, e.y);
      const dx = p.x - uiLastX.value;
      const dy = p.y - uiLastY.value;
      const jumpSqScreen = dx * dx + dy * dy;
      const jumpDistScreen = Math.sqrt(jumpSqScreen);

      // Ignore impossible spikes, but keep the path resumable.
      if (jumpDistScreen > HARD_DROP_SCREEN_PX) {
        const reset = activePath.value.copy();
        reset.moveTo(p.x, p.y);
        activePath.value = reset;
        uiLastX.value = p.x;
        uiLastY.value = p.y;
        return;
      }

      if (jumpSqScreen < MIN_POINT_DIST_SCREEN_PX * MIN_POINT_DIST_SCREEN_PX) return;

      const nextPath = activePath.value.copy();
      if (jumpDistScreen > MAX_JUMP_SCREEN_PX) {
        // For fast motion, bridge with mini-segments instead of breaking the stroke.
        const steps = Math.max(2, Math.ceil(jumpDistScreen / BRIDGE_STEP_SCREEN_PX));
        let prevX = uiLastX.value;
        let prevY = uiLastY.value;
        for (let i = 1; i <= steps; i += 1) {
          const t = i / steps;
          const nx = uiLastX.value + dx * t;
          const ny = uiLastY.value + dy * t;
          const midX = (prevX + nx) / 2;
          const midY = (prevY + ny) / 2;
          nextPath.quadTo(prevX, prevY, midX, midY);
          if (i === steps) nextPath.lineTo(nx, ny);
          prevX = nx;
          prevY = ny;
        }
      } else {
        const midX = (uiLastX.value + p.x) / 2;
        const midY = (uiLastY.value + p.y) / 2;
        nextPath.quadTo(uiLastX.value, uiLastY.value, midX, midY);
        nextPath.lineTo(p.x, p.y);
      }
      activePath.value = nextPath;

      uiLastX.value = p.x;
      uiLastY.value = p.y;

      runOnJS(continueDrawing)(p.x, p.y);
    })
    .onEnd(() => {
      'worklet';
      runOnJS(endDrawing)();
    })
    .onFinalize(() => {
      'worklet';
      runOnJS(endDrawing)();
    });
  const canvasGestures = Gesture.Simultaneous(drawingGesture, pinchGesture);

  const flattenedPicture = useMemo(() => {
    const recorder = Skia.PictureRecorder();
    const canvas = recorder.beginRecording(Skia.XYWHRect(0, 0, LOGICAL_SIZE, LOGICAL_SIZE));
    const paint = Skia.Paint();

    paint.setStyle(PaintStyle.Stroke);
    paint.setStrokeCap(StrokeCap.Round);
    paint.setStrokeJoin(StrokeJoin.Round);

    committedStrokes.forEach((stroke) => {
      paint.setStrokeWidth(stroke.width);
      paint.setBlendMode(stroke.isEraser ? BlendMode.Clear : BlendMode.SrcOver);
      paint.setColor(Skia.Color(stroke.color));
      canvas.drawPath(stroke.path, paint);
    });

    return recorder.finishRecordingAsPicture();
  }, [committedStrokes]);

  const activeStrokeWidth = activeTool === 'eraser' ? ERASER_WIDTH : PEN_WIDTH;
  const activeStrokeColor = activeTool === 'eraser' ? '#000000' : activeColor;

  useEffect(() => {
    setPagerScrollEnabled(isShieldMode);
    return () => setPagerScrollEnabled(true);
  }, [isShieldMode, setPagerScrollEnabled]);

  useEffect(() => {
    return () => {
      if (handoffClearTimerRef.current) clearTimeout(handoffClearTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (activeTabIndex !== 1) {
      enterShieldMode();
    }
  }, [activeTabIndex, enterShieldMode]);

  return (
    <View style={styles.container}>
      <GestureDetector gesture={canvasGestures}>
        <View
          style={styles.canvasWrap}
          pointerEvents={isShieldMode ? 'none' : 'auto'}
          onLayout={(e) => {
            canvasWidth.value = e.nativeEvent.layout.width;
            canvasHeight.value = e.nativeEvent.layout.height;
          }}
        >
          <ScrollView
            bounces={false}
            nestedScrollEnabled
            scrollEnabled={isPanMode}
            showsVerticalScrollIndicator={isPanMode}
            onScroll={(e) => {
              scrollY.value = e.nativeEvent.contentOffset.y;
            }}
            onTouchStart={() => {
              if (!isShieldMode) setPagerScrollEnabled(false);
            }}
            scrollEventThrottle={16}
            style={styles.panOuterScroll}
            contentContainerStyle={styles.panOuterContent}
          >
            <ScrollView
              horizontal
              bounces={false}
              nestedScrollEnabled
              scrollEnabled={isPanMode}
              showsHorizontalScrollIndicator={isPanMode}
              onScroll={(e) => {
                scrollX.value = e.nativeEvent.contentOffset.x;
              }}
              onTouchStart={() => {
                if (!isShieldMode) setPagerScrollEnabled(false);
              }}
              scrollEventThrottle={16}
              style={styles.panInnerScroll}
              contentContainerStyle={styles.panInnerContent}
            >
              <Animated.View style={[styles.logicalCanvas, zoomCanvasStyle]}>
                <Canvas ref={canvasRef} style={StyleSheet.absoluteFill}>
                  <Group>
                    <Picture picture={flattenedPicture} />
                    <Path
                      path={activePath}
                      color={activeStrokeColor}
                      style="stroke"
                      strokeWidth={activeStrokeWidth}
                      strokeCap="round"
                      strokeJoin="round"
                      blendMode={activeTool === 'eraser' ? 'clear' : 'srcOver'}
                    />
                    <Path
                      path={handoffPath}
                      color={handoffColor}
                      style="stroke"
                      strokeWidth={handoffWidth}
                      strokeCap="round"
                      strokeJoin="round"
                      blendMode={handoffIsEraser.value ? 'clear' : 'srcOver'}
                    />
                  </Group>
                </Canvas>
              </Animated.View>
            </ScrollView>
          </ScrollView>
        </View>
      </GestureDetector>

      <View style={styles.headerPillWrap} pointerEvents="none">
        <View style={styles.headerPill}>
          <View style={styles.headerPillDot} />
          <Text style={styles.headerPillText}>SHARED GUESTBOOK</Text>
        </View>
      </View>

      <View style={styles.topRightActions} pointerEvents="box-none">
        <TouchableOpacity
          style={[styles.miniActionBtn, isShieldMode && styles.miniActionBtnActive]}
          onPress={() => {
            if (isShieldMode) {
              setInteractionMode('draw');
            } else {
              enterShieldMode();
            }
          }}
        >
          {isShieldMode ? <ShieldOff size={13} color="#fb7185" /> : <Shield size={13} color="#d1d5db" />}
        </TouchableOpacity>
        <TouchableOpacity style={styles.miniActionBtn} onPress={handleDownload}>
          <Download size={13} color="#d1d5db" />
        </TouchableOpacity>
      </View>

      {showClearConfirm && (
        <View style={styles.clearConfirmWrap} pointerEvents="box-none">
          <View style={styles.clearConfirmPill}>
            <Text style={styles.clearConfirmText}>clear canvas?</Text>
            <TouchableOpacity onPress={() => setShowClearConfirm(false)} style={styles.clearConfirmBtn}>
              <Text style={styles.clearConfirmNo}>no</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleClear} style={styles.clearConfirmBtn}>
              <Text style={styles.clearConfirmYes}>yes</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {!showToolsUi && (
        <View style={styles.rightRail} pointerEvents="box-none">
        <TouchableOpacity
          style={[styles.fab, styles.penFab, isDrawMode && styles.fabActive]}
          onPress={() => {
            setShowToolsUi(true);
            setShowClearConfirm(false);
            setInteractionMode('draw');
          }}
        >
          <Edit2 size={18} color="#fff" />
        </TouchableOpacity>
        </View>
      )}

      {showToolsUi && (
        <View style={styles.toolsWrap} pointerEvents="box-none">
          {showHuePicker && (
            <View style={styles.huePopover}>
              <GestureDetector gesture={hueGesture}>
                <View
                  style={styles.hueTrackWrap}
                  onLayout={(e) => setPickerWidth(Math.max(60, e.nativeEvent.layout.width))}
                >
                  <LinearGradient
                    colors={['#ff0000', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#ff00ff', '#ff0000']}
                    start={{ x: 0, y: 0.5 }}
                    end={{ x: 1, y: 0.5 }}
                    style={styles.hueTrack}
                  />
                  <Animated.View style={[styles.hueThumb, hueThumbStyle]} />
                </View>
              </GestureDetector>
            </View>
          )}

          <View style={styles.toolsBar}>
            <View style={styles.swatchRow}>
              {PRESET_COLORS.map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[styles.swatch, { backgroundColor: c }, activeColor === c && styles.swatchActive]}
                  onPress={() => {
                    setInteractionMode('draw');
                    setActiveColor(c);
                    setActiveTool('pen');
                  }}
                />
              ))}
              <TouchableOpacity
                style={[styles.swatch, styles.pickerSlotSwatch, { backgroundColor: pickerSlotColor }]}
                onPress={() => {
                  setInteractionMode('draw');
                  setActiveTool('pen');
                  setActiveColor(pickerSlotColor);
                }}
              />
              <TouchableOpacity
                onPress={() => {
                  if (showHuePicker) {
                    commitPickerSlotColor();
                    setShowHuePicker(false);
                  } else {
                    setShowHuePicker(true);
                  }
                }}
                style={styles.rainbowSaveWrap}
              >
                <LinearGradient
                  colors={['#ff0000', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#ff00ff', '#ff0000']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.rainbowSave}
                />
              </TouchableOpacity>
            </View>

            <View style={styles.divider} />

            <TouchableOpacity
              style={[styles.toolBtn, (isDrawMode || isPanMode) && styles.toolBtnActive]}
              onPress={() => {
                setShowClearConfirm(false);
                if (isPanMode) {
                  setInteractionMode('draw');
                  setActiveTool('pen');
                } else {
                  setInteractionMode('pan');
                }
              }}
            >
              {isPanMode ? <Edit2 size={14} color="#fb7185" /> : <Move size={14} color="#d1d5db" />}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toolBtn, activeTool === 'eraser' && styles.toolBtnActive]}
              onPress={() => setActiveTool('eraser')}
            >
              <Eraser size={14} color={activeTool === 'eraser' ? '#fb7185' : '#d1d5db'} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.toolBtn} onPress={handleUndo}>
              <Undo2 size={14} color="#d1d5db" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.toolBtn} onPress={handleRedo}>
              <Redo2 size={14} color="#d1d5db" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.toolBtn} onPress={() => setShowClearConfirm(true)}>
              <Trash2 size={14} color="#d1d5db" />
            </TouchableOpacity>
            <View style={styles.divider} />
            <TouchableOpacity style={styles.toolBtn} onPress={() => setShowToolsUi(false)}>
              <X size={14} color="#d1d5db" />
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: SCREEN_WIDTH,
    height: CANVAS_HEIGHT,
    backgroundColor: '#070707',
    marginVertical: 16,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  canvasWrap: {
    flex: 1,
    overflow: 'hidden',
  },
  headerPillWrap: {
    position: 'absolute',
    left: 12,
    top: 10,
    zIndex: 10,
  },
  headerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(108, 21, 36, 0.52)',
    borderWidth: 1,
    borderColor: 'rgba(251,113,133,0.5)',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 8,
  },
  headerPillDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#fb7185',
  },
  headerPillText: {
    color: '#f4b3c0',
    fontSize: 9,
    letterSpacing: 1.3,
    fontWeight: '700',
  },
  clearConfirmWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 92,
    alignItems: 'center',
    zIndex: 20,
  },
  clearConfirmPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(6,6,6,0.88)',
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  clearConfirmText: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 13,
    fontWeight: '500',
  },
  clearConfirmBtn: {
    paddingHorizontal: 2,
    paddingVertical: 1,
  },
  clearConfirmNo: {
    color: 'rgba(255,255,255,0.76)',
    fontSize: 13,
    fontWeight: '700',
  },
  clearConfirmYes: {
    color: '#fb7185',
    fontSize: 13,
    fontWeight: '700',
  },
  topRightActions: {
    position: 'absolute',
    top: 10,
    right: 12,
    zIndex: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  miniActionBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(8,8,8,0.8)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  miniActionBtnActive: {
    borderColor: 'rgba(251,113,133,0.6)',
    backgroundColor: 'rgba(251,113,133,0.12)',
  },
  logicalCanvas: {
    width: LOGICAL_SIZE,
    height: LOGICAL_SIZE,
  },
  panOuterScroll: {
    flex: 1,
  },
  panOuterContent: {
    minHeight: LOGICAL_SIZE,
  },
  panInnerScroll: {
    flex: 1,
  },
  panInnerContent: {
    width: LOGICAL_SIZE,
    height: LOGICAL_SIZE,
  },
  toolsWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 10,
    alignItems: 'center',
  },
  toolsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(8,8,8,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  huePopover: {
    marginBottom: 8,
    alignSelf: 'center',
    width: 138,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(8,8,8,0.92)',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  hueTrackWrap: {
    height: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(12,12,12,0.9)',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  hueTrack: {
    width: '100%',
    height: 8,
    borderRadius: 6,
  },
  hueThumb: {
    position: 'absolute',
    top: 1,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: '#fff',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  swatchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 3,
  },
  swatch: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  swatchActive: {
    borderColor: '#fff',
    transform: [{ scale: 1.08 }],
  },
  pickerSlotSwatch: {
    borderColor: 'rgba(255,255,255,0.5)',
  },
  rainbowSaveWrap: {
    width: 18,
    height: 18,
    borderRadius: 9,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  rainbowSave: {
    width: '100%',
    height: '100%',
  },
  toolBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolBtnActive: {
    backgroundColor: 'rgba(251,113,133,0.14)',
  },
  divider: {
    width: 1,
    height: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginHorizontal: 2,
  },
  rightRail: {
    position: 'absolute',
    right: 10,
    bottom: 22,
    gap: 10,
    alignItems: 'center',
  },
  fab: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(108, 21, 36, 0.72)',
    borderWidth: 1,
    borderColor: 'rgba(251,113,133,0.5)',
  },
  penFab: {
    width: 46,
    height: 46,
    borderRadius: 23,
  },
  fabActive: {
    borderColor: '#fb7185',
  },
});
