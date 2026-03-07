"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Trash2, Undo2, Redo2, Loader2, Pen, Eraser, X, Shield, ShieldOff, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { useViewport } from "@/contexts/viewport-context";
import { useBatteryOptimization } from "@/hooks/use-battery-optimization";

interface Point { x: number; y: number }
interface Stroke { points: Point[]; color: string; width: number; isEraser?: boolean }
interface SharedDoodleProps {
    onSave?: (path: string) => Promise<any>;
    savedPath?: string;
    coupleId?: string;          // enables live realtime sync
    isReadOnly?: boolean;
}

function hueToHex(h: number): string {
    const s = 0.9, l = 0.58;
    const a = s * Math.min(l, 1 - l);
    const f = (n: number) => {
        const k = (n + h / 30) % 12;
        const c = l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
        return Math.round(255 * c).toString(16).padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
}

const PRESET_COLORS = ['#ffffff', '#fb7185', '#a855f7'];
const BASE_CANVAS_MIN_PX = 1200;
const BASE_CANVAS_MAX_PX = 2000;
const BASE_CANVAS_MULTIPLIER = 3.2;

/** Simple custom hue slider with persistence and preview */
function HuePicker({ hue, onChange }: { hue: number; onChange: (h: number) => void }) {
    const trackRef = useRef<HTMLDivElement>(null);
    const thumbRef = useRef<HTMLDivElement>(null);
    const previewRef = useRef<HTMLDivElement>(null);
    const dragging = useRef(false);
    const localHue = useRef(hue);

    const applyHue = (h: number) => {
        localHue.current = h;
        const hex = hueToHex(h);
        const pct = (h / 359) * 100;

        if (thumbRef.current) {
            thumbRef.current.style.left = `${pct}%`;
            thumbRef.current.style.backgroundColor = hex;
            thumbRef.current.style.boxShadow = `0 0 10px 2px ${hex}60, 0 2px 8px rgba(0,0,0,0.4)`;
        }
        if (previewRef.current) {
            previewRef.current.style.backgroundColor = hex;
        }
    };

    const getHueFromPointer = (clientX: number) => {
        const track = trackRef.current;
        if (!track) return localHue.current;
        const trackRect = track.getBoundingClientRect();
        const pct = Math.max(0, Math.min(1, (clientX - trackRect.left) / trackRect.width));
        return Math.round(pct * 359);
    };

    const onPointerDown = (e: React.PointerEvent) => {
        dragging.current = true;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        applyHue(getHueFromPointer(e.clientX));
    };
    const onPointerMove = (e: React.PointerEvent) => {
        if (!dragging.current) return;
        applyHue(getHueFromPointer(e.clientX));
    };
    const onPointerUp = () => {
        if (!dragging.current) return;
        dragging.current = false;
        onChange(localHue.current);
    };

    useEffect(() => {
        applyHue(hue);
    }, [hue]);

    const thumbPct = (hue / 359) * 100;
    const thumbHex = hueToHex(hue);

    return (
        <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.94 }}
            transition={{ duration: 0.14, ease: 'easeOut' }}
            className="flex items-center gap-3 bg-black/80 px-4 py-3 rounded-2xl border border-white/20 shadow-2xl"
            style={{ width: '14rem' }}
        >
            <div
                ref={previewRef}
                className="w-7 h-7 rounded-full flex-shrink-0 shadow-lg ring-2 ring-white/20"
                style={{ backgroundColor: thumbHex }}
            />

            <div
                ref={trackRef}
                className="relative flex-1 h-3 rounded-full cursor-pointer select-none touch-none"
                style={{ background: 'linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)' }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
            >
                <div
                    ref={thumbRef}
                    className="absolute top-1/2 w-6 h-6 rounded-full border-2 border-white shadow-xl pointer-events-none"
                    style={{
                        left: `${thumbPct}%`,
                        transform: 'translate(-50%, -50%)',
                        backgroundColor: thumbHex,
                        boxShadow: `0 0 10px 2px ${thumbHex}60, 0 2px 8px rgba(0,0,0,0.4)`,
                    }}
                />
            </div>
        </motion.div>
    );
}

export function SharedDoodle({ onSave, savedPath, coupleId, isReadOnly = false }: SharedDoodleProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [allStrokes, setAllStrokes] = useState<Stroke[]>([]);
    const [viewScale, setViewScale] = useState(1);
    const [baseCanvasPx, setBaseCanvasPx] = useState(BASE_CANVAS_MIN_PX);
    const [activeTool, setActiveTool] = useState<'pan' | 'pen' | 'eraser'>('pan');
    const [color, setColor] = useState('#ffffff');
    const [lastSyncedPath, setLastSyncedPath] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [isAutoSaving, setIsAutoSaving] = useState(false);
    const [showHueSlider, setShowHueSlider] = useState(false);
    const [hue, setHue] = useState(0);
    const [customSwatches, setCustomSwatches] = useState<string[]>([]);
    const { isKeyboardVisible: isTyping } = useViewport();
    const { isVisible } = useBatteryOptimization();
    const [confirmClear, setConfirmClear] = useState(false);
    const [isCanvasScrollProtected, setIsCanvasScrollProtected] = useState(true);
    const isCanvasEditMode = !isReadOnly && activeTool !== 'pan';
    const isPanMode = activeTool === 'pan';

    const viewScaleRef = useRef(1);
    useEffect(() => { viewScaleRef.current = viewScale; }, [viewScale]);
    useEffect(() => {
        // Non-edit mode should always be neutral zoom.
        if (activeTool === 'pan' && viewScaleRef.current !== 1) {
            viewScaleRef.current = 1;
            setViewScale(1);
        }
    }, [activeTool]);
    const gestureFrameRef = useRef<number | null>(null);
    const gestureStateRef = useRef<{ scale: number; scrollLeft: number; scrollTop: number } | null>(null);
    const redrawFrameRef = useRef<number | null>(null);

    const activePointers = useRef(new Set<number>());
    const isTwoFingerGestureRef = useRef(false);

    useEffect(() => {
        const updateBaseSize = () => {
            const container = containerRef.current;
            if (!container) return;
            const viewportMax = Math.max(container.clientWidth, container.clientHeight);
            const computed = Math.round(viewportMax * BASE_CANVAS_MULTIPLIER);
            const next = Math.max(BASE_CANVAS_MIN_PX, Math.min(BASE_CANVAS_MAX_PX, computed));
            setBaseCanvasPx(prev => (prev === next ? prev : next));
        };
        updateBaseSize();
        window.addEventListener('resize', updateBaseSize);
        return () => window.removeEventListener('resize', updateBaseSize);
    }, []);
    const applyScaleAtPoint = useCallback((nextScale: number, clientX: number, clientY: number) => {
        const container = containerRef.current;
        if (!container) return;

        const oldScale = viewScaleRef.current;
        if (Math.abs(nextScale - oldScale) < 0.001) return;

        const rect = container.getBoundingClientRect();
        const viewportX = clientX - rect.left;
        const viewportY = clientY - rect.top;
        const contentX = container.scrollLeft + viewportX;
        const contentY = container.scrollTop + viewportY;
        const ratio = nextScale / oldScale;

        setViewScale(nextScale);
        viewScaleRef.current = nextScale;
        requestAnimationFrame(() => {
            const current = containerRef.current;
            if (!current) return;
            current.scrollLeft = contentX * ratio - viewportX;
            current.scrollTop = contentY * ratio - viewportY;
        });
    }, []);

    useEffect(() => {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container || !isCanvasEditMode) return;

        let lastMid: { x: number, y: number } | null = null;
        let lastDistance: number | null = null;

        const queueGestureCommit = () => {
            if (gestureFrameRef.current !== null) return;
            gestureFrameRef.current = requestAnimationFrame(() => {
                gestureFrameRef.current = null;
                const gs = gestureStateRef.current;
                const current = containerRef.current;
                if (!gs || !current) return;
                current.scrollLeft = gs.scrollLeft;
                current.scrollTop = gs.scrollTop;
                if (Math.abs(gs.scale - viewScaleRef.current) > 0.0005) {
                    viewScaleRef.current = gs.scale;
                    setViewScale(gs.scale);
                }
            });
        };

        const handleTouchStart = (e: TouchEvent) => {
            // As soon as a second finger touches down, forcibly stop any active ink stroke
            if (e.touches.length >= 2) {
                isTwoFingerGestureRef.current = true;
                if (isDrawing.current) cancelDrawing();
                const t1 = e.touches[0];
                const t2 = e.touches[1];
                lastMid = { x: (t1.clientX + t2.clientX) / 2, y: (t1.clientY + t2.clientY) / 2 };
                lastDistance = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
                const gs = gestureStateRef.current ?? { scale: 1, scrollLeft: 0, scrollTop: 0 };
                gs.scale = viewScaleRef.current;
                gs.scrollLeft = container.scrollLeft;
                gs.scrollTop = container.scrollTop;
                gestureStateRef.current = gs;
            }
        };

        const handleTouchMove = (e: TouchEvent) => {
            // Handle 2-finger pinch zoom + pan on canvas for all tools
            if (e.touches.length === 2) {
                isTwoFingerGestureRef.current = true;
                const t1 = e.touches[0];
                const t2 = e.touches[1];
                const distance = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
                const midX = (t1.clientX + t2.clientX) / 2;
                const midY = (t1.clientY + t2.clientY) / 2;
                if (lastDistance === null || lastMid === null) {
                    lastDistance = distance;
                    lastMid = { x: midX, y: midY };
                }

                e.preventDefault(); // keep gesture scoped to canvas
                // Combined pinch-pan transform: keep content under fingers stable while zooming.
                const gs = gestureStateRef.current ?? { scale: viewScaleRef.current, scrollLeft: container.scrollLeft, scrollTop: container.scrollTop };
                const oldScale = gs.scale;
                const nextScale = Math.max(0.9, Math.min(4, oldScale * (distance / lastDistance)));
                const scaleRatio = nextScale / oldScale;
                const rect = container.getBoundingClientRect();
                const prevVpX = lastMid.x - rect.left;
                const prevVpY = lastMid.y - rect.top;
                const currVpX = midX - rect.left;
                const currVpY = midY - rect.top;
                const nextScrollLeft = (gs.scrollLeft + prevVpX) * scaleRatio - currVpX;
                const nextScrollTop = (gs.scrollTop + prevVpY) * scaleRatio - currVpY;

                gs.scale = nextScale;
                gs.scrollLeft = nextScrollLeft;
                gs.scrollTop = nextScrollTop;
                gestureStateRef.current = gs;
                queueGestureCommit();

                lastMid = { x: midX, y: midY };
                lastDistance = distance;
            }
        };

        const handleTouchEnd = (e: TouchEvent) => {
            if (e.touches.length < 2) {
                lastMid = null;
                lastDistance = null;
                gestureStateRef.current = null;
                if (e.touches.length === 0) {
                    isTwoFingerGestureRef.current = false;
                }
            }
        };

        canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
        canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
        canvas.addEventListener('touchend', handleTouchEnd);
        canvas.addEventListener('touchcancel', handleTouchEnd);

        return () => {
            if (gestureFrameRef.current !== null) {
                cancelAnimationFrame(gestureFrameRef.current);
                gestureFrameRef.current = null;
            }
            canvas.removeEventListener('touchstart', handleTouchStart);
            canvas.removeEventListener('touchmove', handleTouchMove);
            canvas.removeEventListener('touchend', handleTouchEnd);
            canvas.removeEventListener('touchcancel', handleTouchEnd);
        };
    }, [isCanvasEditMode, applyScaleAtPoint]);

    // Persistence: load hue and last mode from localStorage
    useEffect(() => {
        const savedHue = localStorage.getItem('orbit_doodle_hue');
        const savedColor = localStorage.getItem('orbit_doodle_color');
        const wasCustom = localStorage.getItem('orbit_doodle_is_custom') === 'true';
        const savedSwatches = sessionStorage.getItem(`orbit_doodle_swatches_${coupleId}`);

        if (savedSwatches) {
            try {
                setCustomSwatches(JSON.parse(savedSwatches));
            } catch (e) { console.error('Swatch load error', e); }
        }

        if (savedColor) {
            setColor(savedColor);
            if (savedHue !== null) setHue(parseInt(savedHue));
        } else if (savedHue !== null) {
            const h = parseInt(savedHue);
            setHue(h);
            if (wasCustom) {
                setColor(hueToHex(h));
            }
        } else {
            // Default to white
            setColor('#ffffff');
            setHue(0);
        }
    }, [coupleId]);

    // Local persistence of strokes to prevent 'vanishing' on remounts
    useEffect(() => {
        if (allStrokes.length > 0) {
            sessionStorage.setItem(`orbit_doodle_live_${coupleId}`, JSON.stringify(allStrokes));
        }
    }, [allStrokes, coupleId]);

    const isDrawing = useRef(false);
    const currentStroke = useRef<Point[]>([]);
    const currentStrokeMetaRef = useRef<{ color: string; width: number; isEraser: boolean }>({ color: '#fb7185', width: 3, isEraser: false });
    const renderedStrokePointCountRef = useRef(0);
    const allStrokesRef = useRef<Stroke[]>([]);
    const redoStackRef = useRef<Stroke[][]>([]); // each entry = full strokes snapshot
    const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastSyncedPathRef = useRef('');
    const isDirtyRef = useRef(false);
    const isSendingRef = useRef(false);

    // Delta Sync States
    const remoteStrokesRef = useRef<Record<string, { points: Point[], meta: { color: string, width: number, isEraser: boolean }, renderedCount: number }>>({});
    const lastBroadcastAtRef = useRef(0);
    const syncedPointCountRef = useRef(0);
    const strokeIdRef = useRef<string | null>(null);
    const someoneDrawingRef = useRef(false);
    const lastScrollBroadcastAtRef = useRef(0);
    const isRemoteScrollingRef = useRef(false);

    useEffect(() => { allStrokesRef.current = allStrokes; }, [allStrokes]);
    useEffect(() => { lastSyncedPathRef.current = lastSyncedPath; }, [lastSyncedPath]);



    // ─────────────────────────────────────────────────────────────────────────

    const drawSegment = useCallback((points: Point[], meta: { color: string, width: number, isEraser: boolean }, lastCount: number) => {
        const canvas = canvasRef.current;
        if (!canvas || points.length < 2) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const fromIndex = Math.max(1, lastCount);
        if (fromIndex >= points.length) return;

        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.strokeStyle = meta.isEraser ? '#000' : meta.color;
        ctx.lineWidth = meta.width;
        ctx.globalCompositeOperation = meta.isEraser ? 'destination-out' : 'source-over';
        ctx.moveTo(points[fromIndex - 1].x, points[fromIndex - 1].y);

        for (let i = fromIndex; i < points.length - 1; i++) {
            const midX = (points[i].x + points[i + 1].x) / 2;
            const midY = (points[i].y + points[i + 1].y) / 2;
            ctx.quadraticCurveTo(points[i].x, points[i].y, midX, midY);
        }
        ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
        ctx.stroke();
        ctx.globalCompositeOperation = 'source-over';
    }, []);

    const redraw = useCallback(() => {
        if (!isVisible) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        // Match the capped DPR used in resize/coordinate mapping
        const dpr = Math.min(window.devicePixelRatio || 1, 1.25);
        ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
        allStrokesRef.current.forEach(s => drawSegment(s.points, { color: s.color, width: s.width, isEraser: !!s.isEraser }, 0));
        if (isDrawing.current && currentStroke.current.length > 1) {
            drawCurrentStrokeIncremental();
        }
    }, [drawSegment, isVisible]);

    const queueRedraw = useCallback(() => {
        if (redrawFrameRef.current !== null) return;
        redrawFrameRef.current = requestAnimationFrame(() => {
            redrawFrameRef.current = null;
            redraw();
        });
    }, [redraw]);

    const drawCurrentStrokeIncremental = useCallback(() => {
        const points = currentStroke.current;
        const meta = currentStrokeMetaRef.current;
        const lastCount = renderedStrokePointCountRef.current;
        drawSegment(points, meta, lastCount);
        renderedStrokePointCountRef.current = points.length;
    }, [drawSegment]);


    const isDirty = useMemo(() => {
        const cur = JSON.stringify(allStrokes);
        if (allStrokes.length === 0 && (!lastSyncedPath || lastSyncedPath === '[]')) return false;
        return cur !== lastSyncedPath;
    }, [allStrokes, lastSyncedPath]);

    // Keep dirty/sending refs in sync
    useEffect(() => { isDirtyRef.current = isDirty; }, [isDirty]);
    useEffect(() => { isSendingRef.current = isSending; }, [isSending]);

    // Stable performSave — reads live values via refs, never recreated on each stroke
    const performSave = useCallback(async () => {
        const pd = JSON.stringify(allStrokesRef.current);
        if (!onSave || pd === lastSyncedPathRef.current || isSendingRef.current) return;

        isSendingRef.current = true;
        setIsSending(true);
        try {
            const result = await onSave(pd);
            if (!result?.error) {
                lastSyncedPathRef.current = pd;
                setLastSyncedPath(pd);
                setIsAutoSaving(false);

                // Broadcast for INSTANT partner sync
                if (typeof window !== 'undefined' && (window as any).orbitSend) {
                    (window as any).orbitSend('doodle_delta', { path: pd, event: 'full-sync' });
                }
            }
        } catch (e) { console.error('Save error', e); }
        finally { isSendingRef.current = false; setIsSending(false); }
    }, [onSave, coupleId]);


    /** Save a specific stroke array immediately — used for clear() */
    const saveImmediate = useCallback(async (strokes: Stroke[]) => {
        if (!onSave || isSendingRef.current) return;
        isSendingRef.current = true;
        setIsSending(true);
        try {
            const pd = JSON.stringify(strokes);
            const result = await onSave(pd);
            if (!result?.error) {
                lastSyncedPathRef.current = pd;
                setLastSyncedPath(pd);
                // Broadcast clear immediately
                if (typeof window !== 'undefined' && (window as any).orbitSend) {
                    (window as any).orbitSend('doodle_delta', { path: pd, event: 'full-sync' });
                }
            } else {
                console.error('[SharedDoodle] Save immediate failed:', result.error);
            }
        } catch (e) { console.error('[SharedDoodle] saveImmediate threw:', e); }
        finally { isSendingRef.current = false; setIsSending(false); }
    }, [onSave, coupleId]);

    // Schedule the autosave timer directly — NOT via a useEffect.
    const scheduleAutoSave = useCallback(() => {
        if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = setTimeout(() => {
            // Only perform save if NO ONE is currently drawing
            if (isDrawing.current || someoneDrawingRef.current) {
                scheduleAutoSave(); // reschedule
                return;
            }
            setIsAutoSaving(true);
            performSave();
        }, 5000);
    }, [performSave]);

    // Initial load logic: SessionStorage > Props
    const hasInitialLoaded = useRef(false);
    useEffect(() => {
        if (hasInitialLoaded.current) return;

        const liveData = sessionStorage.getItem(`orbit_doodle_live_${coupleId}`);
        const dataToLoad = liveData || savedPath;

        if (dataToLoad) {
            try {
                const parsed = JSON.parse(dataToLoad);
                if (Array.isArray(parsed)) {
                    let strokes: Stroke[] = [];
                    if (parsed.length > 0) {
                        if (parsed[0].points) strokes = parsed;
                        else if (Array.isArray(parsed[0])) strokes = parsed.map((p: any) => ({ points: p, color: '#fb7185', width: 3, isEraser: false }));
                        else if (parsed[0].x !== undefined) strokes = [{ points: parsed, color: '#fb7185', width: 3, isEraser: false }];
                    }
                    setAllStrokes(strokes);
                    allStrokesRef.current = strokes;

                    // If we loaded live data, we still need to know what the 'last synced' version was from props
                    if (savedPath) {
                        setLastSyncedPath(savedPath);
                        lastSyncedPathRef.current = savedPath;
                    } else if (liveData) {
                        // If no props but we have live data, assume it's dirty
                        setLastSyncedPath('');
                        lastSyncedPathRef.current = '';
                    }

                    hasInitialLoaded.current = true;
                    requestAnimationFrame(() => queueRedraw());
                }
            } catch (e) { console.error(e); }
        }
    }, [savedPath, coupleId]);

    // ── Realtime: subscribe to partner's updates (Master Wire) ────────────
    useEffect(() => {
        if (!coupleId) return;

        const handleFullSync = (newPath: string) => {
            if (!newPath || isSendingRef.current || newPath === lastSyncedPathRef.current) return;
            try {
                const parsed = JSON.parse(newPath);
                if (!Array.isArray(parsed)) return;

                const strokes: Stroke[] = parsed[0]?.points ? parsed
                    : parsed.map((p: any) => ({ points: p, color: '#fb7185', width: 3, isEraser: false }));

                if (newPath !== JSON.stringify(allStrokesRef.current)) {
                    const next = strokes;
                    allStrokesRef.current = next;
                    setAllStrokes(next);
                    lastSyncedPathRef.current = newPath;
                    setLastSyncedPath(newPath);
                    sessionStorage.setItem(`orbit_doodle_live_${coupleId}`, newPath);
                    queueRedraw();
                }
            } catch (e) { console.error('Sync parse error', e); }
        };

        const handleDelta = (payload: any) => {
            const { type, id, points, meta } = payload;
            const remote = remoteStrokesRef.current;

            if (type === 'start') {
                remote[id] = { points, meta, renderedCount: 1 };
                drawSegment(points, meta, 0);
            } else if (type === 'points') {
                if (!remote[id]) return;
                const stroke = remote[id];
                const lastCount = stroke.renderedCount;
                stroke.points.push(...points);
                drawSegment(stroke.points, stroke.meta, lastCount);
                stroke.renderedCount = stroke.points.length;
            } else if (type === 'end') {
                if (!remote[id]) return;
                const finalStroke = { points: remote[id].points, color: remote[id].meta.color, width: remote[id].meta.width, isEraser: remote[id].meta.isEraser };
                delete remote[id];
                const next = [...allStrokesRef.current, finalStroke];
                allStrokesRef.current = next;
                setAllStrokes(next);
            }
        };

        const onDelta = (e: any) => {
            const payload = e.detail;
            if (payload.event === 'full-sync') {
                if (payload.path) handleFullSync(payload.path);
            } else if (payload.event === 'drawing-state') {
                const { isDrawing: remoteIsDrawing } = payload;
                someoneDrawingRef.current = remoteIsDrawing;
                if (!remoteIsDrawing && !isDrawing.current) scheduleAutoSave();
            } else if (payload.event === 'sync-request') {
                if (!isSendingRef.current && isDirtyRef.current) performSave();
            } else if (payload.event === 'scroll-sync') {
                const container = containerRef.current;
                if (container) {
                    isRemoteScrollingRef.current = true;
                    if (payload.scale && Math.abs(payload.scale - viewScaleRef.current) > 0.001) {
                        viewScaleRef.current = payload.scale;
                        setViewScale(payload.scale);
                    }
                    requestAnimationFrame(() => {
                        if (payload.scrollLeftPct !== undefined) {
                            container.scrollTo({
                                left: payload.scrollLeftPct * Math.max(1, container.scrollWidth - container.clientWidth),
                                top: payload.scrollTopPct * Math.max(1, container.scrollHeight - container.clientHeight),
                                behavior: 'instant'
                            });
                        }
                        setTimeout(() => { isRemoteScrollingRef.current = false; }, 32);
                    });
                }
            } else if (payload.type) {
                handleDelta(payload);
            }
        };

        const onFullSync = (e: any) => handleFullSync(e.detail);

        window.addEventListener('orbit:doodle-delta', onDelta);
        window.addEventListener('orbit:doodle-full-sync', onFullSync);

        return () => {
            window.removeEventListener('orbit:doodle-delta', onDelta);
            window.removeEventListener('orbit:doodle-full-sync', onFullSync);
        };
    }, [coupleId, scheduleAutoSave]);

    // Auto-lock on window scroll to prevent mistouch while navigating the dashboard
    useEffect(() => {
        if (isReadOnly) return;
        const handleAutoLock = () => {
            if (!isCanvasScrollProtected || activeTool !== 'pan') {
                setIsCanvasScrollProtected(true);
                setActiveTool('pan');
                setShowHueSlider(false);
            }
        };
        window.addEventListener('scroll', handleAutoLock, { passive: true });
        return () => window.removeEventListener('scroll', handleAutoLock);
    }, [isCanvasScrollProtected, activeTool, isReadOnly]);


    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const handleResize = () => {
            const rect = canvas.getBoundingClientRect();
            // Instagram-grade: Capped DPR 1.25. Massive GPU relief in WebViews.
            const dpr = Math.min(window.devicePixelRatio || 1, 1.25);

            canvas.width = rect.width * dpr;
            canvas.height = rect.height * dpr;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.scale(dpr, dpr);
                redraw();
            }
        };
        handleResize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [redraw, isCanvasEditMode]);

    // Removed global full-redraw useEffect. Redraws are now manually triggered only for destructive state changes.
    useEffect(() => {
        return () => {
            if (redrawFrameRef.current !== null) {
                cancelAnimationFrame(redrawFrameRef.current);
                redrawFrameRef.current = null;
            }
        };
    }, []);

    const getPosFromClient = useCallback((clientX: number, clientY: number) => {
        const canvas = canvasRef.current!;
        const rect = canvas.getBoundingClientRect();
        const dpr = Math.min(window.devicePixelRatio || 1, 1.25);
        const internalWidth = canvas.width / dpr;
        const internalHeight = canvas.height / dpr;
        const x = (clientX - rect.left) * (internalWidth / rect.width);
        const y = (clientY - rect.top) * (internalHeight / rect.height);
        return { x, y };
    }, []);

    const getPos = (e: React.PointerEvent) => getPosFromClient(e.clientX, e.clientY);
    const finishPointer = (pointerId: number) => {
        activePointers.current.delete(pointerId);
        if (activePointers.current.size !== 0) return;
        if (isTwoFingerGestureRef.current) {
            cancelDrawing();
            isTwoFingerGestureRef.current = false;
        } else {
            stopDrawing();
        }
    };

    const broadcastDelta = (type: 'start' | 'points' | 'end', payload: any) => {
        if (!coupleId) return;
        if (typeof window !== 'undefined' && (window as any).orbitSend) {
            (window as any).orbitSend('doodle_delta', { type, id: strokeIdRef.current, ...payload });
        }
    }

    const startDrawing = (e: React.PointerEvent) => {
        if (isReadOnly || activeTool === 'pan') return;
        if (e.pointerType === 'mouse') e.preventDefault();
        if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);

        const point = getPos(e);
        const meta = { color, width: activeTool === 'eraser' ? 20 : 3, isEraser: activeTool === 'eraser' };

        isDrawing.current = true;
        currentStrokeMetaRef.current = meta;
        renderedStrokePointCountRef.current = 1;
        syncedPointCountRef.current = 1;
        lastBroadcastAtRef.current = performance.now();
        currentStroke.current = [point];
        strokeIdRef.current = `s-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

        (e.target as HTMLElement).setPointerCapture(e.pointerId);

        broadcastDelta('start', { points: [point], meta });
        // Broadcast that we've started drawing to sync timers
        if (typeof window !== 'undefined' && (window as any).orbitSend) {
            (window as any).orbitSend('doodle_delta', { event: 'drawing-state', isDrawing: true });
        }
    };

    const draw = (e: React.PointerEvent) => {
        if (!isDrawing.current) return;
        const nativeEvt = e.nativeEvent as PointerEvent;
        const samples = nativeEvt.getCoalescedEvents?.() ?? [nativeEvt];
        const prevLen = currentStroke.current.length;
        for (const sample of samples) {
            currentStroke.current.push(getPosFromClient(sample.clientX, sample.clientY));
        }
        if (currentStroke.current.length === prevLen) return;

        if (currentStroke.current.length > 1) {
            drawCurrentStrokeIncremental();
        }

        // --- PERFORMANCE: Ultra-fast direct WebSocket sync ---
        const now = performance.now();
        if (now - lastBroadcastAtRef.current > 16) { // 60Hz sync - incredibly silky smooth 
            const nextBatch = currentStroke.current.slice(syncedPointCountRef.current);

            // Only broadcast if the pen has actually moved a significant distance (2px)
            const lastSent = currentStroke.current[syncedPointCountRef.current - 1];
            const latest = currentStroke.current[currentStroke.current.length - 1];
            const dist = lastSent && latest ? Math.hypot(latest.x - lastSent.x, latest.y - lastSent.y) : 0;

            if (nextBatch.length > 0 && dist > 2) {
                broadcastDelta('points', { points: nextBatch });
                syncedPointCountRef.current = currentStroke.current.length;
                lastBroadcastAtRef.current = now;
            }
        }
    };

    const stopDrawing = () => {
        if (!isDrawing.current) return;
        drawCurrentStrokeIncremental();
        isDrawing.current = false;

        const points = currentStroke.current;
        if (points.length > 1) {
            // Final broadcast batch
            const remaining = points.slice(syncedPointCountRef.current);
            if (remaining.length > 0) {
                broadcastDelta('points', { points: remaining });
            }
            broadcastDelta('end', {});

            redoStackRef.current = [];
            const meta = currentStrokeMetaRef.current;
            const newStroke = { points: [...points], color: meta.color, width: meta.width, isEraser: meta.isEraser };
            const next = [...allStrokesRef.current, newStroke];
            allStrokesRef.current = next;
            setAllStrokes(next);
            scheduleAutoSave();
        }

        currentStroke.current = [];
        renderedStrokePointCountRef.current = 0;
        syncedPointCountRef.current = 0;
        strokeIdRef.current = null;

        // Broadcast that we've stopped
        if (typeof window !== 'undefined' && (window as any).orbitSend) {
            (window as any).orbitSend('doodle_delta', { event: 'drawing-state', isDrawing: false });
        }
    };

    const cancelDrawing = () => {
        if (!isDrawing.current) return;
        // Discard in-progress stroke so pinch zoom/pan never triggers save.
        isDrawing.current = false;
        currentStroke.current = [];
        renderedStrokePointCountRef.current = 0;
        queueRedraw();

        // Broadcast that we've stopped
        if (typeof window !== 'undefined' && (window as any).orbitSend) {
            (window as any).orbitSend('doodle_delta', { event: 'drawing-state', isDrawing: false });
        }
    };

    const handleUndo = () => {
        if (!isReadOnly && !isSending && allStrokesRef.current.length > 0) {
            // Push current state onto redo stack before undoing
            redoStackRef.current = [...redoStackRef.current, [...allStrokesRef.current]];
            const newStrokes = allStrokesRef.current.slice(0, -1);
            allStrokesRef.current = newStrokes;
            setAllStrokes(newStrokes);
            // Instant sync for undo
            saveImmediate(newStrokes);
            queueRedraw();
        }
    };
    const handleRedo = () => {
        if (!isReadOnly && !isSending && redoStackRef.current.length > 0) {
            const next = redoStackRef.current[redoStackRef.current.length - 1];
            redoStackRef.current = redoStackRef.current.slice(0, -1);
            allStrokesRef.current = next;
            setAllStrokes(next);
            // Instant sync for redo
            saveImmediate(next);
            queueRedraw();
        }
    };
    const clear = () => {
        if (!isReadOnly && !isSending) {
            if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
            // Save snapshot for redo before clearing
            if (allStrokesRef.current.length > 0) {
                redoStackRef.current = [...redoStackRef.current, [...allStrokesRef.current]];
            }
            setAllStrokes([]);
            allStrokesRef.current = [];
            sessionStorage.removeItem(`orbit_doodle_live_${coupleId}`);
            saveImmediate([]);
            setConfirmClear(false);
            queueRedraw();
        }
    };

    const handleHuePick = (h: number) => {
        const hex = hueToHex(h);
        setHue(h);
        localStorage.setItem('orbit_doodle_hue', h.toString());
        localStorage.setItem('orbit_doodle_color', hex);
        localStorage.setItem('orbit_doodle_is_custom', 'true');
        setColor(hex);
        setActiveTool('pen');
        setIsCanvasScrollProtected(false); // Unlock on tool selection

        // Store exactly ONE most recent custom color
        if (!PRESET_COLORS.includes(hex)) {
            setCustomSwatches([hex]);
            sessionStorage.setItem(`orbit_doodle_swatches_${coupleId}`, JSON.stringify([hex]));
        }
    };

    const handleDownload = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        // Export to high-quality PNG
        try {
            const dataUrl = canvas.toDataURL("image/png");
            const link = document.createElement('a');
            link.download = `orbit-doodle-${Date.now()}.png`;
            link.href = dataUrl;
            link.click();
        } catch (e) {
            console.error('Download error', e);
        }
    };


    return (
        <div className="relative w-full h-full bg-[#070707] rounded-none border border-white/10 overflow-hidden shadow-2xl group/doodle">
            <div
                ref={containerRef}
                onScroll={(e) => {
                    if (isRemoteScrollingRef.current || !coupleId) return;
                    const now = performance.now();
                    if (now - lastScrollBroadcastAtRef.current > 16) { // 60Hz sync
                        lastScrollBroadcastAtRef.current = now;
                        const container = containerRef.current;
                        if (!container) return;

                        const scrollLeftPct = container.scrollLeft / Math.max(1, container.scrollWidth - container.clientWidth);
                        const scrollTopPct = container.scrollTop / Math.max(1, container.scrollHeight - container.clientHeight);

                        if (typeof window !== 'undefined' && (window as any).orbitSend) {
                            (window as any).orbitSend('doodle_delta', {
                                event: 'scroll-sync',
                                scrollLeftPct,
                                scrollTopPct,
                                scale: viewScaleRef.current
                            });
                        }
                    }
                }}
                className={cn(
                    "w-full h-full [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]",
                    isPanMode && isCanvasScrollProtected ? "overscroll-auto" : "overscroll-contain",
                    isPanMode && isCanvasScrollProtected ? "overflow-hidden" : "overflow-auto"
                )}
            >
                <canvas
                    ref={canvasRef}
                    className={cn(
                        "transition-opacity block",
                        activeTool !== 'pan' ? "cursor-crosshair" : "cursor-grab active:cursor-grabbing",
                        isCanvasScrollProtected && "pointer-events-none opacity-80 grayscale-[0.2]",
                        isSending ? "opacity-30" : "opacity-100"
                    )}
                    // Let CSS touch-action and our manual 2-finger scroll handle complex gestures smoothly
                    style={{
                        width: isPanMode ? `${baseCanvasPx}px` : `${baseCanvasPx * viewScale}px`,
                        height: isPanMode ? `${baseCanvasPx}px` : `${baseCanvasPx * viewScale}px`,
                        touchAction: isCanvasScrollProtected ? 'pan-y' : (activeTool !== 'pan' ? 'none' : 'pan-x pan-y')
                    }}
                    onWheel={(e) => {
                        // Trackpad pinch / ctrl+wheel zoom scoped to canvas
                        if (!isCanvasEditMode) return;
                        if (!e.ctrlKey && !e.metaKey) return;
                        e.preventDefault();
                        const factor = Math.exp(-e.deltaY * 0.002);
                        const nextScale = Math.max(0.9, Math.min(4, viewScaleRef.current * factor));
                        applyScaleAtPoint(nextScale, e.clientX, e.clientY);
                    }}
                    onPointerDown={(e) => {
                        if (!isCanvasEditMode) return;
                        activePointers.current.add(e.pointerId);
                        if (activePointers.current.size > 1) {
                            isTwoFingerGestureRef.current = true;
                            cancelDrawing();
                            return;
                        }
                        if (isTwoFingerGestureRef.current) return;
                        startDrawing(e);
                    }}
                    onPointerMove={(e) => {
                        if (!isCanvasEditMode) return;
                        if (activePointers.current.size > 1 || isTwoFingerGestureRef.current) return;
                        draw(e);
                    }}
                    onPointerUp={(e) => {
                        if (!isCanvasEditMode) return;
                        finishPointer(e.pointerId);
                    }}
                    onPointerLeave={(e) => {
                        if (!isCanvasEditMode) return;
                        finishPointer(e.pointerId);
                    }}
                    onPointerCancel={(e) => {
                        if (!isCanvasEditMode) return;
                        finishPointer(e.pointerId);
                    }}
                />
            </div>

            {!isReadOnly && (
                <>
                    {activeTool === 'pan' && (
                        <div className="absolute bottom-1.5 right-1.5 flex items-center gap-1.5 z-10">
                            <div className="flex gap-0.5 bg-black/40 rounded-full p-1 border border-white/10 transition-all shadow-xl">
                                <Button variant="ghost" size="icon" className="w-6 h-6 rounded-full hover:bg-white/10 text-white/30 hover:text-white" onClick={handleUndo} disabled={allStrokes.length === 0 || isSending}><Undo2 className="w-3 h-3" /></Button>
                                <Button variant="ghost" size="icon" className="w-6 h-6 rounded-full hover:bg-white/10 text-white/30 hover:text-white" onClick={handleRedo} disabled={redoStackRef.current.length === 0 || isSending}><Redo2 className="w-3 h-3" /></Button>
                                <Button variant="ghost" size="icon" className="w-6 h-6 rounded-full hover:bg-rose-500/10 text-white/30 hover:text-rose-400" onClick={() => setConfirmClear(true)} disabled={allStrokes.length === 0 || isSending}><Trash2 className="w-3 h-3" /></Button>
                            </div>
                            <Button
                                size="icon"
                                className="w-10 h-10 rounded-full bg-rose-500/80 hover:bg-rose-500/90 text-white shadow-xl border border-white/10"
                                onClick={() => {
                                    setActiveTool('pen');
                                    setIsCanvasScrollProtected(false); // Unlock on tool selection
                                }}
                            >
                                <Pen className="w-5 h-5" />
                            </Button>
                        </div>
                    )}

                    <div className="absolute top-3 right-3 z-20">
                        <Button
                            variant="ghost"
                            size="icon"
                            className={cn(
                                "w-8 h-8 rounded-full border border-white/10 fake-blur hover:bg-white/10 transition-all",
                                isCanvasScrollProtected ? "text-sky-300 ring-2 ring-sky-500/30" : "text-white/40 hover:text-white"
                            )}
                            onClick={() => setIsCanvasScrollProtected(v => !v)}
                            title={isCanvasScrollProtected ? "Canvas locked - Scrolling allowed" : "Canvas unlocked - Drawing/Panning allowed"}
                        >
                            {isCanvasScrollProtected ? <Shield className="w-4 h-4" /> : <ShieldOff className="w-4 h-4" />}
                        </Button>
                    </div>


                    {activeTool !== 'pan' && (
                        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 z-20">
                            {/* Slider (No preview dot, pure colors) */}
                            <AnimatePresence>
                                {showHueSlider && (
                                    <motion.div
                                        initial={{ opacity: 0, scale: 0.9, y: 10 }}
                                        animate={{ opacity: 1, scale: 1, y: 0 }}
                                        exit={{ opacity: 0, scale: 0.9, y: 10 }}
                                        className="mb-1 w-[150px] h-6 fake-blur rounded-full px-3 border border-white/10 flex items-center shadow-2xl"
                                    >
                                        <input
                                            type="range"
                                            min="0"
                                            max="360"
                                            value={hue}
                                            onChange={(e) => handleHuePick(parseInt(e.target.value))}
                                            className="w-full h-1 bg-transparent cursor-pointer appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[var(--thumb-color)] [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:shadow-md"
                                            style={{
                                                WebkitAppearance: 'none',
                                                background: 'linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)',
                                                borderRadius: '2px',
                                                '--thumb-color': color
                                            } as React.CSSProperties}
                                        />
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* Toolbar (Ultra soft transparent glass) */}
                            <div className="flex items-center gap-1 fake-blur px-2.5 py-1.5 rounded-full border border-white/10 shadow-2xl transition-all ring-1 ring-white/10">
                                {/* Preset swatches */}
                                <div className="flex items-center gap-1.5 px-1">
                                    {PRESET_COLORS.map(c => (
                                        <button
                                            key={c}
                                            className={cn(
                                                "w-4 h-4 rounded-full ring-1 ring-white/10 transition-all",
                                                color === c && activeTool === 'pen'
                                                    ? "scale-125 ring-2 ring-white shadow-md bg-white border border-white"
                                                    : "opacity-70 hover:opacity-100 hover:scale-110"
                                            )}
                                            style={{ backgroundColor: c }}
                                            onClick={() => {
                                                setColor(c);
                                                setActiveTool('pen');
                                                setIsCanvasScrollProtected(false); // Unlock on tool selection
                                                setShowHueSlider(false);
                                                localStorage.setItem('orbit_doodle_is_custom', 'false');
                                                localStorage.setItem('orbit_doodle_color', c);
                                            }}
                                        />
                                    ))}

                                    {/* Custom session swatches */}
                                    {customSwatches.map(c => (
                                        <button
                                            key={c}
                                            className={cn(
                                                "w-4 h-4 rounded-full ring-1 ring-white/10 transition-all",
                                                color === c && activeTool === 'pen'
                                                    ? "scale-125 ring-2 ring-white shadow-md bg-white border border-white"
                                                    : "opacity-70 hover:opacity-100 hover:scale-110"
                                            )}
                                            style={{ backgroundColor: c }}
                                            onClick={() => {
                                                setColor(c);
                                                setActiveTool('pen');
                                                localStorage.setItem('orbit_doodle_color', c);
                                            }}
                                        />
                                    ))}

                                    {/* Rainbow toggle */}
                                    <button
                                        className={cn(
                                            "w-5 h-5 rounded-full ring-1 ring-white/20 transition-all ml-0.5",
                                            showHueSlider ? "scale-125 shadow-md ring-2 ring-white/30" : "opacity-70 hover:scale-110"
                                        )}
                                        style={{ background: 'conic-gradient(from 0deg,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)' }}
                                        onClick={() => {
                                            if (!showHueSlider) {
                                                if (color === '#fb7185') setHue(354);
                                                else if (color === '#ffffff') setHue(0);
                                                localStorage.setItem('orbit_doodle_is_custom', 'true');
                                            }
                                            setShowHueSlider(v => !v);
                                        }}
                                    />
                                </div>

                                <div className="w-px h-3.5 bg-white/5 mx-0.5" />

                                <div className="flex items-center gap-0.5">
                                    <Button variant="ghost" size="icon"
                                        className={cn("w-6 h-6 rounded-full transition-all", activeTool === 'eraser' ? "bg-white/10 text-white" : "text-white/40 hover:bg-white/5 hover:text-white")}
                                        onClick={() => {
                                            const nextTool = activeTool === 'eraser' ? 'pen' : 'eraser';
                                            setActiveTool(nextTool);
                                            setIsCanvasScrollProtected(false); // Unlock on tool selection
                                        }}>
                                        <Eraser className="w-3.5 h-3.5" />
                                    </Button>
                                    <Button variant="ghost" size="icon"
                                        className="w-6 h-6 rounded-full text-white/30 hover:bg-white/5 hover:text-white"
                                        onClick={handleUndo} disabled={allStrokes.length === 0}>
                                        <Undo2 className="w-3 h-3" />
                                    </Button>
                                    <Button variant="ghost" size="icon"
                                        className="w-6 h-6 rounded-full text-white/30 hover:bg-white/5 hover:text-white"
                                        onClick={handleRedo} disabled={redoStackRef.current.length === 0}>
                                        <Redo2 className="w-3 h-3" />
                                    </Button>
                                </div>

                                <div className="w-px h-3.5 bg-white/5 mx-0.5" />

                                <Button variant="ghost" size="icon"
                                    className="w-6 h-6 rounded-full text-white/30 hover:bg-rose-500/10 hover:text-rose-400"
                                    onClick={() => { setActiveTool('pan'); setShowHueSlider(false); }}>
                                    <X className="w-3.5 h-3.5" />
                                </Button>
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* Inline delete confirmation — no modal, no shadow, lives inside canvas */}
            <AnimatePresence>
                {confirmClear && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        transition={{ duration: 0.12 }}
                        className="absolute inset-0 flex items-center justify-center z-30 pointer-events-none"
                    >
                        <div className="pointer-events-auto flex items-center gap-3 bg-black/60 px-4 py-2 rounded-full border border-white/10">
                            <span className="text-xs text-white/50">clear canvas?</span>
                            <button
                                onClick={() => setConfirmClear(false)}
                                className="text-xs text-white/40 hover:text-white/70 transition-colors"
                            >no</button>
                            <button
                                onClick={clear}
                                className="text-xs text-rose-400 hover:text-rose-300 transition-colors font-medium"
                            >yes</button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Label + save indicator */}
            <div className="absolute top-4 left-5 flex items-center gap-2 z-20">
                <div className="p-1 px-2 rounded-full bg-rose-500/10 border border-rose-500/20 fake-blur">
                    <p className="text-[9px] font-bold text-rose-300 uppercase tracking-[0.2em]">Shared Guestbook</p>
                </div>

                <div className="flex items-center gap-1.5 bg-black/40 px-2 py-1 rounded-full border border-white/10 shadow-lg">
                    {isSending || isAutoSaving ? (
                        <Loader2 className="w-2.5 h-2.5 text-rose-400 animate-spin" />
                    ) : (
                        <button
                            onClick={() => {
                                if (isDirty) {
                                    performSave();
                                    (window as any).orbitSend('doodle_delta', { event: 'sync-request' });
                                }
                            }}
                            className={cn(
                                "flex items-center transition-all",
                                isDirty ? "text-amber-400 hover:text-amber-300" : "text-emerald-400/60"
                            )}
                            disabled={!isDirty || isSending}
                            title={isDirty ? "Sync Required" : "Synced"}
                        >
                            <div className={cn(
                                "w-2 h-2 rounded-full",
                                isDirty ? "bg-amber-400 animate-pulse" : "bg-emerald-400/40"
                            )} />
                        </button>
                    )}

                    <div className="w-px h-3 bg-white/10 mx-0.5" />
                    <button
                        onClick={handleDownload}
                        className="text-white/40 hover:text-white transition-colors active:scale-90"
                        title="Download drawing"
                    >
                        <Download className="w-3 h-3" />
                    </button>
                </div>
            </div>

        </div>
    );
}
