"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Heart, Calendar, MapPin, Upload, X, Shield, FileUp } from "lucide-react";
import { createMemory, updateMemory } from "@/lib/client/memories";
import { refreshDashboard } from "@/lib/client/auth";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { getTodayIST, cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { optimizeImage } from "@/lib/image-optimization";
import { useAppMode } from "@/components/app-mode-context";
import { useBackHandler } from '../global-back-handler';
import { useViewport } from "@/contexts/viewport-context";
import { useOrbitStore } from "@/lib/store/global-store";
import { buildPrivateMediaUrl, uploadToR2 } from "@/lib/storage";
import { encryptMediaFile, hasStoredMediaPassphrase, importRecoveryKit as restoreKey, isE2EEEnabled } from "@/lib/client/crypto-e2ee";
import { FEATURES } from "@/lib/client/feature-flags";

interface EditingMemory {
    id: string;
    title: string;
    description: string;
    image_urls: string[];
    location: string | null;
    memory_date: string;
}

interface AddMemoryDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    editingMemory?: EditingMemory | null;
    onSuccess?: () => void;
    onDelete?: (id: string) => Promise<void>;
}

const MEMORY_TITLE_MAX_LENGTH = 60;
const MAX_IMAGE_FILE_SIZE_MB = 2;
const MAX_IMAGE_FILE_SIZE_BYTES = MAX_IMAGE_FILE_SIZE_MB * 1024 * 1024;
const MAX_TOTAL_MEDIA = 20;
const MAX_VIDEO_COUNT = 2;
const MAX_VIDEO_DURATION_SECONDS = 15;
const MAX_VIDEO_FILE_SIZE_MB = 8;
const MAX_VIDEO_FILE_SIZE_BYTES = MAX_VIDEO_FILE_SIZE_MB * 1024 * 1024;
const SUPPORTED_IMAGE_MIME_TYPES = new Set([
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
]);
const SUPPORTED_IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"];
const SUPPORTED_VIDEO_MIME_TYPES = new Set([
    "video/mp4",
    "video/webm",
    "video/quicktime",
]);
const SUPPORTED_VIDEO_EXTENSIONS = [".mp4", ".webm", ".mov"];

export function AddMemoryDialog({ open, onOpenChange, editingMemory, onSuccess, onDelete }: AddMemoryDialogProps) {
    const router = useRouter();
    const { toast } = useToast();
    const { coupleId } = useAppMode();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const recoveryInputRef = useRef<HTMLInputElement>(null);
    const descriptionTextareaRef = useRef<HTMLTextAreaElement | null>(null);
    const formScrollRef = useRef<HTMLDivElement>(null);

    const hasStoredKeyInState = useOrbitStore(s => s.hasE2EEKey);
    const setHasE2EEKey = useOrbitStore(s => s.setHasE2EEKey);

    const [newMemory, setNewMemory] = useState({
        title: "",
        description: "",
        location: "",
        memory_date: getTodayIST(),
    });
    const [uploading, setUploading] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [previewUrls, setPreviewUrls] = useState<string[]>([]);
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const [existingImages, setExistingImages] = useState<string[]>([]);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [showE2EEWarning, setShowE2EEWarning] = useState(false);
    const [warningConfirmed, setWarningConfirmed] = useState(false);
    const { isKeyboardVisible: isTyping } = useViewport();
    const [modalHeight, setModalHeight] = useState<number>(740);
    const lastOrientationRef = useRef<"portrait" | "landscape" | null>(null);

    const hasStoredKey = FEATURES.E2EE_ENABLED && typeof window !== 'undefined' ? (isE2EEEnabled() && (hasStoredKeyInState || hasStoredMediaPassphrase())) : false;

    const handleRestoreKey = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            await restoreKey(file);
            setHasE2EEKey(true);
            toast({ title: "Privacy Key Restored", variant: "success" });
            setShowE2EEWarning(false);
        } catch (err: any) {
            toast({ title: "Restore Failed", description: err.message, variant: "destructive" });
        } finally {
            if (e.target) e.target.value = "";
        }
    };

    const handleGenerateKey = async () => {
        try {
            const { ensureMediaPassphrase } = await import("@/lib/client/crypto-e2ee");
            await ensureMediaPassphrase();
            setHasE2EEKey(true);
            toast({ title: "New Privacy Key Generated", description: "You can now upload with E2EE.", variant: "success" });
            setShowE2EEWarning(false);
        } catch (err: any) {
            toast({ title: "Generation Failed", description: err.message, variant: "destructive" });
        }
    };

    useEffect(() => {
        if (open) {
            if (editingMemory) {
                setNewMemory({
                    title: editingMemory.title,
                    description: editingMemory.description || "",
                    location: editingMemory.location || "",
                    memory_date: editingMemory.memory_date,
                });
                setExistingImages(editingMemory.image_urls || []);
            } else {
                setNewMemory({
                    title: "",
                    description: "",
                    location: "",
                    memory_date: getTodayIST(),
                });
                setExistingImages([]);
            }
            setPreviewUrls([]);
            setSelectedFiles([]);
            requestAnimationFrame(() => {
                if (descriptionTextareaRef.current) descriptionTextareaRef.current.style.height = "120px";
            });
            requestAnimationFrame(() => {
                if (formScrollRef.current) formScrollRef.current.scrollTop = 0;
            });
        }
    }, [open, editingMemory]);

    useBackHandler(() => {
        if (showDeleteConfirm) {
            setShowDeleteConfirm(false);
        } else if (showE2EEWarning) {
            setShowE2EEWarning(false);
        } else {
            onOpenChange(false);
        }
    }, open);

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const allFiles = Array.from(e.target.files || []);
        const supportedFiles = allFiles.filter((file) => {
            const byMime = SUPPORTED_IMAGE_MIME_TYPES.has(file.type.toLowerCase());
            const byExt = SUPPORTED_IMAGE_EXTENSIONS.some((ext) => file.name.toLowerCase().endsWith(ext));
            const videoByMime = SUPPORTED_VIDEO_MIME_TYPES.has(file.type.toLowerCase());
            const videoByExt = SUPPORTED_VIDEO_EXTENSIONS.some((ext) => file.name.toLowerCase().endsWith(ext));
            return byMime || byExt || videoByMime || videoByExt;
        });

        if (supportedFiles.length !== allFiles.length) {
            toast({
                title: "Some files are not supported",
                description: "Only JPG/PNG/WebP/HEIC/HEIF and MP4/WebM/MOV are allowed.",
                variant: "destructive",
            });
        }

        const existingVideoCount = existingImages.filter((url) => isVideoUrl(url)).length;
        const selectedVideoCount = selectedFiles.filter((file) => isVideoFile(file)).length;
        const incomingVideoCount = supportedFiles.filter((file) => isVideoFile(file)).length;
        if ((existingVideoCount + selectedVideoCount + incomingVideoCount) > MAX_VIDEO_COUNT) {
            toast({
                title: `Maximum ${MAX_VIDEO_COUNT} videos`,
                description: `You can attach up to ${MAX_VIDEO_COUNT} videos in one memory.`,
                variant: "destructive",
            });
            if (e.target) e.target.value = "";
            return;
        }

        const files = supportedFiles;
        const totalCount = files.length + selectedFiles.length + existingImages.length;
        if (totalCount > MAX_TOTAL_MEDIA) {
            toast({ title: `Maximum ${MAX_TOTAL_MEDIA} items`, variant: "destructive" });
            return;
        }
        if (files.length === 0) return;

        setUploading(true);
        try {
            const processedFiles = await Promise.all(files.map(async (file) => {
                if (isVideoFile(file)) {
                    if (file.size > MAX_VIDEO_FILE_SIZE_BYTES) throw new Error(`Each video must be ${MAX_VIDEO_FILE_SIZE_MB}MB or smaller.`);
                    const duration = await getVideoDurationSeconds(file);
                    if (duration > MAX_VIDEO_DURATION_SECONDS) throw new Error(`Each video must be ${MAX_VIDEO_DURATION_SECONDS}s or shorter.`);
                    return file;
                }
                return optimizeImage(file, 1200, 1200, 0.82);
            }));

            const hasCompressionFailure = processedFiles.some((file) => !isVideoFile(file) && file.type !== "image/webp");
            if (hasCompressionFailure) {
                toast({ title: "Image optimization failed", variant: "destructive" });
                if (e.target) e.target.value = "";
                return;
            }

            const newPreviews = processedFiles.map((file) => URL.createObjectURL(file));
            setPreviewUrls((prev) => [...prev, ...newPreviews]);
            setSelectedFiles((prev) => [...prev, ...processedFiles]);
        } catch (err: any) {
            toast({ title: "File error", description: err.message, variant: "destructive" });
        } finally {
            setUploading(false);
            if (e.target) e.target.value = "";
        }
    };

    const removeFile = (index: number) => {
        URL.revokeObjectURL(previewUrls[index]);
        setPreviewUrls((prev) => prev.filter((_, i) => i !== index));
        setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
    };

    const removeExistingImage = (index: number) => {
        setExistingImages((prev) => prev.filter((_, i) => i !== index));
    };

    const uploadImages = async (coupleIdToUse: string): Promise<string[]> => {
        const urls: string[] = [];
        const hasKey = FEATURES.E2EE_ENABLED && hasStoredMediaPassphrase() && isE2EEEnabled();

        for (const file of selectedFiles) {
            const ext = isVideoFile(file) ? (file.name.toLowerCase().endsWith(".mov") ? "mov" : file.name.toLowerCase().endsWith(".webm") ? "webm" : "mp4") : "webp";
            const fileName = `${coupleIdToUse}/${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;

            if (hasKey) {
                const encrypted = await encryptMediaFile(file, fileName);
                if (process.env.NEXT_PUBLIC_UPLOAD_URL && process.env.NEXT_PUBLIC_UPLOAD_SECRET) {
                    await uploadToR2(encrypted.blob, 'memories', fileName, "application/octet-stream");
                } else {
                    throw new Error("R2 Configuration missing for E2EE upload");
                }

                urls.push(buildPrivateMediaUrl('memories', fileName, {
                    enc: '1',
                    iv: encrypted.ivB64,
                    mime: encrypted.mime
                }));
            } else {
                if (process.env.NEXT_PUBLIC_UPLOAD_URL && process.env.NEXT_PUBLIC_UPLOAD_SECRET) {
                    await uploadToR2(file, 'memories', fileName, file.type);
                } else {
                    throw new Error("R2 Configuration missing for upload");
                }
                urls.push(fileName);
            }
        }
        return urls;
    };

    const saveMemory = async (forceNoE2EE = false) => {
        const hasKey = FEATURES.E2EE_ENABLED && hasStoredMediaPassphrase() && isE2EEEnabled();

        if (FEATURES.E2EE_ENABLED && !hasKey && !warningConfirmed && !forceNoE2EE) {
            setShowE2EEWarning(true);
            return;
        }

        const normalizedTitle = hasKey ? "Encrypted Memory" : newMemory.title.trim();
        if (!normalizedTitle) {
            toast({ title: "Title required", variant: "destructive" });
            return;
        }

        setUploading(true);
        try {
            let coupleIdToUse = coupleId;
            if (!coupleIdToUse) {
                const { auth, db } = await import("@/lib/firebase/client");
                const { doc, getDoc } = await import("firebase/firestore");
                const user = auth.currentUser;
                if (!user) {
                    toast({ title: "Session expired", variant: "destructive" });
                    return;
                }
                const userDoc = await getDoc(doc(db, "users", user.uid));
                const profile = userDoc.data();
                if (!profile?.couple_id) {
                    toast({ title: "You must be paired first", variant: "destructive" });
                    return;
                }
                coupleIdToUse = profile.couple_id;
            }

            if (!coupleIdToUse) {
                toast({ title: "Internal error: No couple context", variant: "destructive" });
                return;
            }

            const newImageUrls = await uploadImages(coupleIdToUse);
            const allImageUrls = [...existingImages, ...newImageUrls];

            if (editingMemory) {
                const res = await updateMemory(editingMemory.id, {
                    title: normalizedTitle,
                    description: newMemory.description,
                    image_urls: allImageUrls,
                    location: (newMemory.location || null) as string | null,
                    memory_date: newMemory.memory_date,
                });
                if (res.error) throw new Error(res.error);
                toast({ title: "Memory Updated", variant: "success" });
            } else {
                const res = await createMemory({
                    title: normalizedTitle,
                    description: newMemory.description,
                    image_urls: allImageUrls,
                    location: (newMemory.location || null) as string | null,
                    memory_date: newMemory.memory_date,
                });
                if (res.error) throw new Error(res.error);
                if (res.data) useOrbitStore.getState().upsertMemory(res.data);
                toast({ title: "Memory Captured", variant: "success" });
            }

            onOpenChange(false);
            onSuccess?.();
            router.refresh();
            await refreshDashboard();
        } catch (error: any) {
            console.error("[AddMemory] Error:", error);
            toast({ title: "Failed to save memory", description: error.message, variant: "destructive" });
        } finally {
            setUploading(false);
        }
    };

    const computeModalHeight = () => {
        const stableHeight = typeof window !== "undefined"
            ? Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--app-height-stable")) || window.innerHeight
            : 740;
        return Math.max(560, Math.min(740, stableHeight - 20));
    };

    const [keyboardHeight, setKeyboardHeight] = useState(0);

    useEffect(() => {
        if (!open || typeof window === "undefined") return;
        const vv = window.visualViewport;
        const update = () => {
            if (!vv) return;
            const keyboard = window.innerHeight - vv.height - vv.offsetTop;
            setKeyboardHeight(Math.max(0, keyboard));
        };
        vv?.addEventListener("resize", update);
        vv?.addEventListener("scroll", update);
        update();
        return () => {
            vv?.removeEventListener("resize", update);
            vv?.removeEventListener("scroll", update);
        };
    }, [open]);

    useEffect(() => {
        if (!open || typeof window === "undefined") return;
        setInitial();
        function setInitial() {
            setModalHeight(computeModalHeight());
            lastOrientationRef.current = window.innerWidth > window.innerHeight ? "landscape" : "portrait";
        }
        const onResize = () => {
            const current = window.innerWidth > window.innerHeight ? "landscape" : "portrait";
            if (lastOrientationRef.current !== current) {
                lastOrientationRef.current = current;
                setModalHeight(computeModalHeight());
            }
        };
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, [open]);

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent
                    className={cn(
                        "w-[90vw] sm:w-[calc(100%-1.5rem)] sm:max-w-[560px] lg:max-w-[760px]",
                        "grid grid-rows-[auto,minmax(0,1fr),auto] min-h-0",
                        "border border-white/20 bg-neutral-950/95 backdrop-blur-md",
                        "shadow-[0_24px_100px_rgba(0,0,0,1)] text-white rounded-3xl",
                        "p-0 gap-0 overflow-hidden"
                    )}
                    style={{
                        width: "min(calc(var(--app-width-stable, 100vw) - 1rem), 760px)",
                        height: `${modalHeight}px`,
                        maxHeight: `${modalHeight}px`,
                        paddingTop: "calc(env(safe-area-inset-top, 0px))",
                        paddingBottom: "calc(env(safe-area-inset-bottom, 0px))",
                    }}
                >
                    <DialogHeader className="px-5 sm:px-6 lg:px-5 pt-3 pb-3 border-b border-white/10 bg-black/20 shrink-0 z-20">
                        <DialogTitle className="flex items-center gap-3 font-serif text-2xl sm:text-[2rem] lg:text-[1.75rem] text-rose-100 break-words min-w-0 w-full overflow-hidden">
                            <Heart className="h-5 w-5 sm:h-6 sm:w-6 text-rose-400 fill-rose-400 shrink-0" />
                            <span>{editingMemory ? "Edit Memory" : "Capture a Memory"}</span>
                        </DialogTitle>
                    </DialogHeader>

                    <div
                        ref={formScrollRef}
                        className={cn(
                            "flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y px-5 sm:px-6 lg:px-5 pt-4 space-y-4 scrollbar-hide transition-all duration-300",
                            isTyping ? "pb-36" : "pb-28"
                        )}
                        style={{
                            WebkitOverflowScrolling: "touch",
                            paddingBottom: `calc(${isTyping ? "9rem" : "7rem"} + env(safe-area-inset-bottom, 0px))`
                        }}
                    >
                        {!hasStoredKey && (
                            <div className="rounded-xl border border-white/10 bg-black/35 p-4 sm:p-5 lg:p-4 space-y-2 overflow-hidden">
                                <Label htmlFor="memory-title" className="text-rose-100/100 font-bold tracking-[0.16em] uppercase text-[10px]">Title <span className="text-rose-400">*</span></Label>
                                <Input
                                    id="memory-title"
                                    placeholder="Our special day..."
                                    value={newMemory.title}
                                    maxLength={MEMORY_TITLE_MAX_LENGTH}
                                    onChange={(e) => setNewMemory((prev) => ({ ...prev, title: e.target.value.slice(0, MEMORY_TITLE_MAX_LENGTH) }))}
                                    className="text-white placeholder:text-white/45 mt-1.5 border-white/20 bg-black/28 focus-visible:ring-white/30"
                                />
                            </div>
                        )}

                        <div className="rounded-xl border border-white/10 bg-black/35 p-4 sm:p-5 lg:p-4">
                            <Label className="text-rose-100/100 font-bold tracking-[0.16em] uppercase text-[10px]">Photos <span className="text-rose-400">*</span></Label>
                            <div className="mt-3 space-y-3">
                                <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
                                    {existingImages.map((url, index) => (
                                        <div key={`existing-${index}`} className="relative aspect-square">
                                            {isVideoUrl(url) ? (
                                                <video src={url} className="w-full h-full object-cover rounded-xl border border-white/10" muted playsInline />
                                            ) : (
                                                <Image src={url || "/placeholder.svg"} alt={`Existing ${index + 1}`} fill sizes="100px" className="object-cover rounded-xl border border-white/10" />
                                            )}
                                            <button onClick={() => removeExistingImage(index)} className="absolute -top-2 -right-2 bg-black/70 text-white rounded-full p-1.5 hover:bg-rose-500/90 transition-all cursor-pointer shadow-md border border-white/20">
                                                <X className="h-3.5 w-3.5" />
                                            </button>
                                        </div>
                                    ))}
                                    {previewUrls.map((url, index) => (
                                        <div key={`new-${index}`} className="relative aspect-square">
                                            {isVideoFile(selectedFiles[index]) ? (
                                                <video src={url} className="w-full h-full object-cover rounded-xl border border-white/10" muted playsInline />
                                            ) : (
                                                <Image src={url || "/placeholder.svg"} alt={`Preview ${index + 1}`} fill sizes="100px" className="object-cover rounded-xl border border-white/10" />
                                            )}
                                            <button onClick={() => removeFile(index)} className="absolute -top-2 -right-2 bg-black/70 text-white rounded-full p-1.5 hover:bg-rose-500/90 transition-all cursor-pointer shadow-md border border-white/20">
                                                <X className="h-3.5 w-3.5" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                                {(existingImages.length + previewUrls.length) < MAX_TOTAL_MEDIA && (
                                    <Button variant="outline" className="w-full h-11 border-dashed bg-black/28 border-white/20 hover:bg-white/5 hover:border-white/25 transition-all text-white/85 hover:text-white rounded-xl" onClick={() => fileInputRef.current?.click()}>
                                        <Upload className="h-5 w-5 mr-2" />
                                        Upload Media ({existingImages.length + previewUrls.length}/{MAX_TOTAL_MEDIA})
                                    </Button>
                                )}
                                <input ref={fileInputRef} type="file" accept=".jpg,.jpeg,.png,.webp,.heic,.heif,.mp4,.webm,.mov" multiple onChange={handleFileSelect} className="hidden" />
                            </div>
                        </div>

                        {!hasStoredKey && (
                            <>
                                <div className="rounded-xl border border-white/10 bg-black/35 p-4 sm:p-5 lg:p-4 space-y-2">
                                    <Label htmlFor="memory-description" className="text-rose-100/100 font-bold tracking-[0.16em] uppercase text-[10px]">Description</Label>
                                    <Textarea
                                        ref={descriptionTextareaRef}
                                        id="memory-description"
                                        placeholder="What made this moment special..."
                                        value={newMemory.description}
                                        onChange={(e) => setNewMemory((prev) => ({ ...prev, description: e.target.value }))}
                                        rows={3}
                                        className="text-white placeholder:text-white/45 mt-1.5 border-white/20 bg-black/28 focus-visible:ring-white/30 resize-none overflow-y-auto minimal-scrollbar h-[140px] min-h-[140px] max-h-[140px]"
                                    />
                                </div>

                                <div className="rounded-xl border border-white/10 bg-black/30 p-4 sm:p-5 lg:p-4 relative z-10">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div>
                                            <Label htmlFor="memory-date" className="flex items-center gap-1.5 text-rose-100/100 font-bold tracking-[0.16em] uppercase text-[10px]">
                                                <Calendar className="h-3 w-3" />
                                                Date
                                            </Label>
                                            <Input
                                                id="memory-date"
                                                type="date"
                                                value={newMemory.memory_date}
                                                onChange={(e) => setNewMemory((prev) => ({ ...prev, memory_date: e.target.value }))}
                                                max={getTodayIST()}
                                                className="text-white mt-1.5 border-white/20 bg-black/28 focus-visible:ring-white/30 [color-scheme:dark]"
                                            />
                                        </div>
                                        <div>
                                            <Label htmlFor="memory-location" className="flex items-center gap-1.5 text-rose-100/100 font-bold tracking-[0.16em] uppercase text-[10px]">
                                                <MapPin className="h-3 w-3" />
                                                Location
                                            </Label>
                                            <Input
                                                id="memory-location"
                                                placeholder="Where..."
                                                value={newMemory.location}
                                                onChange={(e) => setNewMemory((prev) => ({ ...prev, location: e.target.value }))}
                                                className="text-white placeholder:text-white/45 mt-1.5 border-white/20 bg-black/28 focus-visible:ring-white/30"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>

                    <div
                        data-slot="dialog-footer"
                        className="flex gap-3 px-5 py-4 sm:p-5 lg:px-5 lg:py-4 border-t border-white/10 bg-black/35 mt-auto shrink-0 z-20"
                        style={{
                            transform: keyboardHeight ? `translateY(-${keyboardHeight}px)` : undefined,
                            transition: "transform 0.22s ease-out",
                        }}
                    >
                        {editingMemory && onDelete && (
                            <Button
                                variant="destructive"
                                className="flex-1 h-11 rounded-full"
                                onClick={() => setShowDeleteConfirm(true)}
                                disabled={uploading || deleting}
                            >
                                {deleting ? "Deleting..." : "Delete"}
                            </Button>
                        )}
                        <Button onClick={() => saveMemory()} className="flex-1 gap-2 h-12 lg:h-11 rounded-full text-base lg:text-[1.05rem] font-bold transition-all active:scale-95" variant="rosy" disabled={uploading || deleting}>
                            {uploading ? "Saving..." : editingMemory ? "Save" : "Save Memory"}
                        </Button>
                    </div>
                </DialogContent>

                {FEATURES.E2EE_ENABLED && (
                    <AlertDialog open={showE2EEWarning} onOpenChange={setShowE2EEWarning}>
                        <AlertDialogContent className="bg-neutral-950 border-white/10 rounded-3xl p-8 max-w-[420px]">
                            <AlertDialogHeader>
                                <AlertDialogTitle className="text-white flex items-center gap-2">
                                    <Shield className="h-5 w-5 text-amber-500" />
                                    Public Memory?
                                </AlertDialogTitle>
                                <AlertDialogDescription className="text-white/60 text-sm leading-relaxed">
                                    You don't have a <strong>Privacy Key</strong> active on this device.
                                    Without a key, this memory will be stored securely but <strong>not</strong> End-to-End Encrypted.
                                </AlertDialogDescription>

                                <div className="flex flex-col gap-2.5 mt-4">
                                    <Button
                                        variant="outline"
                                        className="w-full justify-start gap-3 h-12 border-white/10 bg-white/5 hover:bg-white/10 rounded-2xl"
                                        onClick={handleGenerateKey}
                                    >
                                        <Shield className="h-4 w-4 text-emerald-400" />
                                        <div className="text-left">
                                            <div className="text-xs font-bold text-white">Generate New Key</div>
                                            <div className="text-[10px] text-white/40">Secure this device immediately</div>
                                        </div>
                                    </Button>

                                    <Button
                                        variant="outline"
                                        className="w-full justify-start gap-3 h-12 border-white/10 bg-white/5 hover:bg-white/10 rounded-2xl"
                                        onClick={() => recoveryInputRef.current?.click()}
                                    >
                                        <FileUp className="h-4 w-4 text-rose-400" />
                                        <div className="text-left">
                                            <div className="text-xs font-bold text-white">Restore from Recovery Kit</div>
                                            <div className="text-[10px] text-white/40">Upload your .json recovery file</div>
                                        </div>
                                    </Button>
                                    <input
                                        ref={recoveryInputRef}
                                        type="file"
                                        accept=".json"
                                        className="hidden"
                                        onChange={handleRestoreKey}
                                    />
                                </div>
                            </AlertDialogHeader>
                            <AlertDialogFooter className="mt-6 flex flex-col sm:flex-row gap-2">
                                <AlertDialogCancel className="sm:flex-1 bg-transparent border-white/10 hover:bg-white/5 rounded-2xl h-11 text-xs">
                                    Cancel
                                </AlertDialogCancel>
                                <AlertDialogAction
                                    className="sm:flex-1 bg-white/10 hover:bg-white/20 text-white/60 hover:text-white rounded-2xl h-11 text-xs border border-white/5"
                                    onClick={() => {
                                        setWarningConfirmed(true);
                                        saveMemory(true);
                                    }}
                                >
                                    Proceed without E2EE
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                )}

                <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
                    <AlertDialogContent className="bg-neutral-950 border-white/10 rounded-3xl p-8 max-w-[400px]">
                        <AlertDialogHeader>
                            <AlertDialogTitle className="text-white">Remove Memory?</AlertDialogTitle>
                            <AlertDialogDescription className="text-white/60">
                                This will permanently delete this memory and all its photos.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter className="mt-6 flex-col sm:flex-row gap-2">
                            <AlertDialogCancel className="bg-transparent border-white/10 hover:bg-white/5 rounded-2xl h-11">Cancel</AlertDialogCancel>
                            <AlertDialogAction
                                className="bg-rose-500 hover:bg-rose-600 rounded-2xl h-11"
                                onClick={async () => {
                                    if (editingMemory && onDelete) {
                                        setDeleting(true);
                                        await onDelete(editingMemory.id);
                                        setDeleting(false);
                                        onOpenChange(false);
                                    }
                                }}
                            >
                                Delete
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </Dialog>
        </>
    );
}

const isVideoFile = (file: File) => {
    const byMime = SUPPORTED_VIDEO_MIME_TYPES.has(file.type.toLowerCase());
    const byExt = SUPPORTED_VIDEO_EXTENSIONS.some((ext) => file.name.toLowerCase().endsWith(ext));
    return byMime || byExt;
};

const isVideoUrl = (url: string) => /\.(mp4|webm|mov)(\?|#|$)/i.test(url);

const getVideoDurationSeconds = (file: File): Promise<number> =>
    new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const video = document.createElement("video");
        video.preload = "metadata";
        video.onloadedmetadata = () => {
            const duration = video.duration;
            URL.revokeObjectURL(url);
            if (!Number.isFinite(duration)) return reject(new Error("Failed to read video duration"));
            resolve(duration);
        };
        video.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error("Failed to read video metadata"));
        };
        video.src = url;
    });
