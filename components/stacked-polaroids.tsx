"use client";

import React, { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { Camera, Trash2, Heart, Flame, ImageIcon, Key } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { m, AnimatePresence, useMotionValue, useTransform } from "framer-motion";
import { PolaroidDetailModal } from "./polaroid-detail-modal";
import { db } from "@/lib/firebase/client";
import { collection, query, onSnapshot } from "firebase/firestore";
import { UploadPolaroidDialog } from "./dialogs/upload-polaroid-dialog";

import { getDashboardPolaroids } from "@/lib/client/polaroids";
import { hasStoredMediaPassphrase, isEncryptedMediaUrl } from "@/lib/client/crypto-e2ee";
import { DecryptedImage } from "./e2ee/decrypted-image";
import { DotLoader } from "@/components/ui/dot-loader";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface PolaroidData {
    id: string;
    image_url: string;
    caption?: string;
    created_at: string;
    user_id?: string;
}

interface StackedPolaroidsProps {
    userPolaroid: PolaroidData | null;
    partnerPolaroid: PolaroidData | null;
    partnerName: string;
    currentUserId?: string;
    coupleId?: string;
    onDelete?: (id: string) => Promise<void>;
    onUploadSuccess?: (polaroid: PolaroidData) => void;
}

export function StackedPolaroids({
    userPolaroid,
    partnerPolaroid,
    partnerName,
    currentUserId,
    coupleId,
    onDelete,
    onUploadSuccess
}: StackedPolaroidsProps) {
    const [view, setView] = useState<"partner" | "user">("partner");
    const [localUserPolaroid, setLocalUserPolaroid] = useState<PolaroidData | null>(userPolaroid);
    const [localPartnerPolaroid, setLocalPartnerPolaroid] = useState<PolaroidData | null>(partnerPolaroid);
    const [selectedPolaroid, setSelectedPolaroid] = useState<PolaroidData | null>(null);
    const [selectedTitle, setSelectedTitle] = useState("");
    const [isUploadOpen, setIsUploadOpen] = useState(false);
    const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const searchParams = useSearchParams();

    // Sync local state with props immediately when they change
    useEffect(() => {
        setLocalUserPolaroid(userPolaroid);
        setLocalPartnerPolaroid(partnerPolaroid);
    }, [userPolaroid, partnerPolaroid]);

    // Handle deep linking for notifications
    useEffect(() => {
        const polaroidId = searchParams.get('polaroidId');
        if (!polaroidId) return;

        if (userPolaroid?.id === polaroidId) {
            setSelectedPolaroid(userPolaroid);
            setSelectedTitle("You");
            setView("user");
        } else if (partnerPolaroid?.id === polaroidId) {
            setSelectedPolaroid(partnerPolaroid);
            setSelectedTitle(partnerName);
            setView("partner");
        }
    }, [searchParams, userPolaroid, partnerPolaroid, partnerName]);

    // Real-time Firestore listener
    useEffect(() => {
        if (!coupleId || !currentUserId) return;

        const q = query(collection(db, 'couples', coupleId, 'polaroids'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as PolaroidData));

            // Client-side sort to avoid requiring composite indexes
            const sortedData = data.sort((a, b) => {
                const da = a.created_at ? (typeof a.created_at === 'string' ? new Date(a.created_at).getTime() : (a.created_at as any).seconds * 1000) : 0;
                const db = b.created_at ? (typeof b.created_at === 'string' ? new Date(b.created_at).getTime() : (b.created_at as any).seconds * 1000) : 0;
                return db - da; // Descending
            });

            const mine = sortedData.find((p: any) => p.user_id === currentUserId) || null;
            const theirs = sortedData.find((p: any) => p.user_id !== currentUserId) || null;

            setLocalUserPolaroid(mine);
            setLocalPartnerPolaroid(theirs);

            // Trigger haptic if a new polaroid is received (briefly)
            if (theirs?.id !== localPartnerPolaroid?.id) {
                triggerHaptic();
            }
        });

        return () => unsubscribe();
    }, [coupleId, currentUserId, localPartnerPolaroid?.id]);

    const triggerHaptic = () => {
        if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
            window.navigator.vibrate(10);
        }
    };

    const didDragRef = useRef(false);
    const hasAny = localUserPolaroid || localPartnerPolaroid;

    const handleCardClick = (item: any) => {
        if (didDragRef.current) {
            didDragRef.current = false;
            return;
        }
        triggerHaptic();
        if (item.data) {
            setSelectedPolaroid(item.data);
            setSelectedTitle(item.label);
        } else if (item.id === "user") {
            setIsUploadOpen(true);
        }
    };

    if (!hasAny) {
        return (
            <div
                onClick={() => setIsUploadOpen(true)}
                className="flex flex-col items-center justify-center p-6 bg-white/5 rounded-2xl border border-rose-950/50 group hover:border-rose-900/40 hover:bg-white/10 transition-colors duration-500 h-[260px] w-[220px] mx-auto overflow-hidden cursor-pointer"
            >
                <div className="relative mb-3">
                    <Camera className="w-10 h-10 text-white/20 group-hover:scale-110 transition-transform duration-500" />
                    <Flame className="w-5 h-5 text-orange-500/40 absolute -bottom-1 -right-1 animate-pulse" />
                </div>
                <h3 className="font-serif italic text-lg text-white/60 tracking-wide mb-1">No Polaroids</h3>
                <p className="font-pinyon text-xl text-white/30 text-center max-w-[130px] leading-none mb-2">
                    Share a moment.
                </p>
                <div className="mt-3 px-4 py-2 rounded-full border border-rose-500/30 bg-rose-500/10 text-[10px] font-black uppercase tracking-[0.2em] text-rose-200 group-hover:bg-rose-500/20 group-hover:scale-105 transition-all duration-300 shadow-[0_0_20px_rgba(244,63,94,0.1)]">
                    Snap a Moment
                </div>

                <UploadPolaroidDialog
                    open={isUploadOpen}
                    onOpenChange={setIsUploadOpen}
                    onSuccess={(newPolaroid) => {
                        setLocalUserPolaroid(newPolaroid);
                        setView("user");
                        onUploadSuccess?.(newPolaroid);
                    }}
                />
            </div>
        );
    }

    const items = [
        { id: "partner", label: partnerName, data: localPartnerPolaroid, canDelete: false, emptyLabel: "Not uploaded yet" },
        { id: "user", label: "You", data: localUserPolaroid, canDelete: true, emptyLabel: "Please upload" }
    ];

    const activeIndex = view === "partner" ? 0 : 1;

    return (
        <>
            <div className="relative w-[280px] h-[360px] mx-auto xl:scale-105 group select-none touch-none perspective-[1000px]">
                <AnimatePresence mode="popLayout" initial={false}>
                    {items.map((item, index) => {
                        const isActive = index === activeIndex;

                        return (
                            <m.div
                                key={item.id}
                                style={{
                                    zIndex: isActive ? 20 : 10,
                                }}
                                className="absolute inset-0 cursor-grab active:cursor-grabbing origin-bottom"
                                animate={{
                                    x: isActive ? 0 : (index === 0 ? -60 : 60),
                                    y: isActive ? 0 : 25,
                                    rotateZ: isActive ? 0 : (index === 0 ? -15 : 15),
                                    scale: isActive ? 1 : 0.82,
                                    opacity: isActive ? 1 : 0.45,
                                }}
                                transition={{
                                    type: "spring",
                                    stiffness: 280,
                                    damping: 18
                                }}
                                drag="x"
                                dragConstraints={{ left: 0, right: 0 }}
                                dragElastic={0.6}
                                onDragEnd={(e, { offset, velocity }) => {
                                    const swipeTrigger = 35;
                                    if (offset.x > swipeTrigger || velocity.x > 350) {
                                        if (view !== "partner") {
                                            triggerHaptic();
                                            setView("partner");
                                        }
                                    } else if (offset.x < -swipeTrigger || velocity.x < -400) {
                                        if (view !== "user") {
                                            triggerHaptic();
                                            setView("user");
                                        }
                                    }
                                }}
                                onClick={() => handleCardClick(item)}
                            >
                                <PolaroidItem
                                    data={item.data}
                                    label={item.label}
                                    emptyLabel={item.emptyLabel}
                                    developedStatus={isActive}
                                    imageUrl={item.data?.image_url}
                                    hasKey={hasStoredMediaPassphrase()}
                                    coupleId={coupleId}
                                    onDelete={item.canDelete && item.data ? () => {
                                        if (item.data) setPendingDeleteId(item.data.id);
                                    } : undefined}
                                />
                            </m.div>
                        );
                    })}
                </AnimatePresence>

                <div className="absolute -bottom-12 left-0 right-0 text-center opacity-0 group-hover:opacity-100 transition-all duration-500 translate-y-2 group-hover:translate-y-0">
                    <span className="text-[10px] font-black text-rose-200/40 uppercase tracking-[0.3em] fake-blur px-4 py-1.5 rounded-full border border-white/5">
                        {view === "partner" ? partnerName : "You"}
                    </span>
                </div>
            </div>

            <PolaroidDetailModal
                polaroid={selectedPolaroid}
                title={selectedTitle}
                isOpen={!!selectedPolaroid}
                onClose={() => setSelectedPolaroid(null)}
            />

            <UploadPolaroidDialog
                open={isUploadOpen}
                onOpenChange={setIsUploadOpen}
                onSuccess={(newPolaroid) => {
                    setLocalUserPolaroid(newPolaroid);
                    setView("user");
                    onUploadSuccess?.(newPolaroid);
                }}
            />

            <AlertDialog open={!!pendingDeleteId} onOpenChange={(open) => !open && setPendingDeleteId(null)}>
                <AlertDialogContent className="bg-zinc-950 border-white/10 rounded-[1.5rem]">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-white">Delete this polaroid?</AlertDialogTitle>
                        <AlertDialogDescription className="text-white/60">
                            This will permanently remove your polaroid from this orbit.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel className="bg-transparent border-white/15 text-white">
                            Cancel
                        </AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-rose-600 hover:bg-rose-500 text-white"
                            onClick={async (e) => {
                                e.preventDefault();
                                if (!pendingDeleteId || isDeleting) return;
                                setIsDeleting(true);
                                try {
                                    await onDelete?.(pendingDeleteId);
                                    setLocalUserPolaroid((prev) => (prev?.id === pendingDeleteId ? null : prev));
                                    setPendingDeleteId(null);
                                } finally {
                                    setIsDeleting(false);
                                }
                            }}
                        >
                            {isDeleting ? "Deleting..." : "Delete"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}

function PolaroidItem({
    data,
    label,
    emptyLabel,
    onDelete,
    developedStatus,
    hasKey,
    coupleId,
    onClick
}: {
    data: PolaroidData | null
    label: string
    emptyLabel: string
    onDelete?: () => void
    developedStatus: boolean
    imageUrl?: string
    hasKey?: boolean
    coupleId?: string
    onClick?: () => void
}) {
    const [developed, setDeveloped] = useState(false);
    const [developProgress, setDevelopProgress] = useState(0);
    const [isShaking, setIsShaking] = useState(false);
    const [isTouchDevice, setIsTouchDevice] = useState(false);
    const [actionsVisible, setActionsVisible] = useState(false);
    const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const longPressTriggeredRef = useRef(false);
    const lastMouseMoveRef = useRef<{ x: number, y: number, t: number } | null>(null);
    const mouseVelocityRef = useRef(0);

    // Physical develop speed
    useEffect(() => {
        if (data && developedStatus) {
            const createdAt = new Date(data.created_at);
            const isNew = !isNaN(createdAt.getTime()) && (new Date().getTime() - createdAt.getTime() < 45000);
            if (isNew && developProgress < 100) {
                const interval = setInterval(() => {
                    setDevelopProgress(prev => {
                        const next = prev + (isShaking ? 3.5 : 1.5);
                        if (next >= 100) {
                            clearInterval(interval);
                            setDeveloped(true);
                            return 100;
                        }
                        return next;
                    });
                }, 100);
                return () => clearInterval(interval);
            } else {
                setDeveloped(true);
                setDevelopProgress(100);
            }
        }
    }, [data, developedStatus, isShaking, developProgress]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const mediaQuery = window.matchMedia('(hover: none), (pointer: coarse)');
        const sync = () => setIsTouchDevice(mediaQuery.matches);
        sync();
        mediaQuery.addEventListener('change', sync);
        return () => mediaQuery.removeEventListener('change', sync);
    }, []);

    useEffect(() => {
        if (!actionsVisible) return;
        const timer = setTimeout(() => setActionsVisible(false), 2600);
        return () => clearTimeout(timer);
    }, [actionsVisible]);

    const startLongPress = () => {
        if (!isTouchDevice || !onDelete || !data) return;
        longPressTriggeredRef.current = false;
        if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = setTimeout(() => {
            longPressTriggeredRef.current = true;
            setActionsVisible(true);
        }, 320);
    };

    const clearLongPress = () => {
        if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
        }
    };

    const isLockedEncrypted = !!(data?.image_url && isEncryptedMediaUrl(data.image_url) && !hasKey);

    const handleCardClick = () => {
        if (longPressTriggeredRef.current) {
            longPressTriggeredRef.current = false;
            return;
        }
        onClick?.();
    };

    const handleDrag = (e: any, info: any) => {
        if (Math.abs(info.velocity.x) > 400 || Math.abs(info.velocity.y) > 400) {
            if (!developed) setIsShaking(true);
        } else {
            setIsShaking(false);
        }
    };

    const handleDragEnd = () => setIsShaking(false);

    const handleMouseMove = (e: React.MouseEvent) => {
        if (developed || isTouchDevice) return;

        const now = Date.now();
        const { clientX: x, clientY: y } = e;

        if (lastMouseMoveRef.current) {
            const dt = now - lastMouseMoveRef.current.t;
            if (dt > 0) {
                const dx = x - lastMouseMoveRef.current.x;
                const dy = y - lastMouseMoveRef.current.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const velocity = dist / dt;

                // Smoothing velocity
                mouseVelocityRef.current = mouseVelocityRef.current * 0.8 + velocity * 0.2;

                if (mouseVelocityRef.current > 1.5) {
                    if (!isShaking) setIsShaking(true);
                } else {
                    if (isShaking) setIsShaking(false);
                }
            }
        }
        lastMouseMoveRef.current = { x, y, t: now };
    };

    const handleMouseLeave = () => {
        setIsShaking(false);
        lastMouseMoveRef.current = null;
        mouseVelocityRef.current = 0;
    };

    return (
        <m.div
            className="group bg-[#fdfdfd] p-3 pb-6 relative w-full h-full border border-gray-200/50 cursor-pointer shadow-[0_15px_35px_rgba(0,0,0,0.3),0_5px_15px_rgba(0,0,0,0.2)] hover:shadow-[0_25px_50px_rgba(0,0,0,0.4)] transition-all duration-500 rounded-[2px]"
            whileTap={{ scale: 0.98, rotateZ: 0 }}
            onClick={handleCardClick}
            onTouchStart={startLongPress}
            onTouchEnd={clearLongPress}
            onTouchCancel={clearLongPress}
            onTouchMove={clearLongPress}
            onDrag={handleDrag}
            onDragEnd={handleDragEnd}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
        >
            {/* Paper Texture Overlay */}
            <div className="absolute inset-0 pointer-events-none opacity-[0.03] rounded-[2px] overflow-hidden">
                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/handmade-paper.png')]" />
            </div>

            <div className="relative aspect-square bg-[#0a0a0a] overflow-hidden rounded-[1px] shadow-[inset_0_0_10px_rgba(0,0,0,0.5)]">
                {data ? (
                    <>
                        {isLockedEncrypted ? (
                            <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center bg-zinc-950">
                                <div className="flex flex-col items-center gap-3 animate-in fade-in zoom-in duration-700">
                                    <div className="p-3 rounded-full bg-white/5 border border-white/10">
                                        <Key className="w-5 h-5 text-rose-400" />
                                    </div>
                                    <p className="text-[10px] font-black text-rose-100/40 uppercase tracking-[0.25em] leading-relaxed">
                                        Vaulted<br />Moment
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <>
                                <m.div
                                    className="w-full h-full"
                                    animate={{
                                        filter: developed ? "blur(0px) grayscale(0)" : `blur(${(100 - developProgress) / 4}px) grayscale(${(100 - developProgress) / 100})`,
                                        opacity: developed ? 1 : Math.max(0.1, developProgress / 100)
                                    }}
                                    transition={{ duration: 1 }}
                                >
                                    <DecryptedImage
                                        src={data.image_url}
                                        alt="Memory"
                                        sizes="280px"
                                        className={cn(
                                            "object-cover w-full h-full",
                                            developed ? "opacity-100" : "opacity-0"
                                        )}
                                        draggable={false}
                                        isEncrypted={isEncryptedMediaUrl(data.image_url)}
                                        prefix={coupleId}
                                    />
                                </m.div>

                                {!developed && (
                                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-900/40 backdrop-blur-[2px]">
                                        <m.div
                                            animate={isShaking ? { scale: [1, 1.1, 1], rotate: [0, 5, -5, 0] } : {}}
                                            transition={{ repeat: Infinity, duration: 0.3 }}
                                            className="flex flex-col items-center gap-2"
                                        >
                                            <Flame className={cn("w-6 h-6 transition-colors duration-300", isShaking ? "text-orange-500 animate-pulse" : "text-white/20")} />
                                            <p className="text-[8px] font-black text-white/40 uppercase tracking-[0.2em]">
                                                {isShaking ? "Developing Fast!" : "Shake to Develop"}
                                            </p>
                                            <div className="w-24 h-1 bg-white/10 rounded-full overflow-hidden mt-2">
                                                <m.div
                                                    className="h-full bg-rose-500"
                                                    initial={{ width: 0 }}
                                                    animate={{ width: `${developProgress}%` }}
                                                />
                                            </div>
                                        </m.div>
                                    </div>
                                )}
                            </>
                        )}
                        {onDelete && (
                            <Button
                                variant="destructive"
                                size="icon"
                                className={cn(
                                    "absolute top-1.5 right-1.5 w-6 h-6 rounded-full transition-opacity z-30",
                                    isTouchDevice
                                        ? (actionsVisible ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none")
                                        : "opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto"
                                )}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onDelete();
                                    setActionsVisible(false);
                                }}
                            >
                                <Trash2 className="w-3 h-3" />
                            </Button>
                        )}
                        <div className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 bg-black/40 backdrop-blur-md rounded text-[7px] font-bold text-white/90 uppercase tracking-widest">
                            {label}
                        </div>
                    </>
                ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-100/50">
                        <Camera className="w-7 h-7 text-gray-300 mb-1.5" />
                        <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest leading-none text-center px-2">{emptyLabel}</span>
                        <div className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 bg-gray-200 rounded text-[7px] font-bold text-gray-500 uppercase tracking-widest">
                            {label}
                        </div>
                    </div>
                )}
            </div>

            <div className="mt-4 px-1 min-h-[60px]">
                {data ? (
                    <>
                        <p className="font-pinyon text-[26px] text-gray-800 leading-tight line-clamp-1 h-8 animate-in fade-in slide-in-from-bottom-1 duration-700">
                            {data.caption || "A moment shared"}
                        </p>
                        <p className="font-serif italic text-[10px] text-gray-400 mt-0.5 opacity-60">
                            {(() => {
                                const d = new Date(data.created_at);
                                return !isNaN(d.getTime()) ? `${formatDistanceToNow(d)} ago` : "Just now";
                            })()}
                        </p>
                    </>
                ) : (
                    <p className="font-pinyon text-[22px] text-gray-300 leading-tight">
                        Waiting...
                    </p>
                )}
            </div>
        </m.div>
    );
}
