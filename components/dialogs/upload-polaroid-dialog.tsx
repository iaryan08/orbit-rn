"use client";

import { useState, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Camera, Upload, X, Loader2, RotateCw } from "lucide-react";
import { optimizeImage } from "@/lib/image-optimization";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { createPolaroid } from "@/lib/client/polaroids";
import { cn } from "@/lib/utils";
import { useBackHandler } from '../global-back-handler';
import { useViewport } from "@/contexts/viewport-context";
import { buildPrivateMediaUrl, uploadToR2 } from "@/lib/storage";
import { encryptMediaFile, hasStoredMediaPassphrase, isE2EEEnabled } from "@/lib/client/crypto-e2ee";
import { db, rtdb, auth } from "@/lib/firebase/client";
import { useOrbitStore } from "@/lib/store/global-store";
import { FEATURES } from "@/lib/client/feature-flags";

interface PolaroidData {
    id: string;
    image_url: string;
    caption?: string;
    created_at: string;
    user_id?: string;
}

interface UploadPolaroidDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess?: (polaroid: PolaroidData) => void;
}

const POLAROID_CAPTION_MAX_LENGTH = 80;

export function UploadPolaroidDialog({ open, onOpenChange, onSuccess }: UploadPolaroidDialogProps) {
    const [file, setFile] = useState<File | null>(null);
    const [preview, setPreview] = useState<string | null>(null);
    const [caption, setCaption] = useState("");
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const [mode, setMode] = useState<'upload' | 'camera'>('camera');
    const [isCameraActive, setIsCameraActive] = useState(false);
    const [cameraFacing, setCameraFacing] = useState<'environment' | 'user'>('user');
    const [cameraError, setCameraError] = useState<string | null>(null);
    const { toast } = useToast();
    const router = useRouter();
    const supabase = createClient();
    const { isKeyboardVisible: isTyping } = useViewport();

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const selected = e.target.files?.[0];
        if (selected) {
            const optimized = await optimizeImage(selected, 1200, 1200, 0.82);
            setFile(optimized);
            setPreview(URL.createObjectURL(optimized));
        }
    };

    useEffect(() => {
        if (open && mode === 'camera') {
            startCamera();
        }
        if (!open) {
            // stop camera when dialog closes
            stopCamera();
            setMode('camera');
        }
        // cleanup on unmount
        return () => stopCamera();
    }, [open]);


    useBackHandler(() => {
        if (mode === 'upload' && preview) {
            setPreview(null);
            setFile(null);
            setMode('camera');
            startCamera();
        } else {
            onOpenChange(false);
        }
    }, open);

    const startCamera = async (facing?: 'environment' | 'user') => {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            setCameraError('Camera not supported');
            return;
        }
        setCameraError(null);
        try {
            const facingModeToUse = facing || cameraFacing;
            const constraints: MediaStreamConstraints = { video: { facingMode: facingModeToUse } };
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            streamRef.current = stream;
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                try { await videoRef.current.play(); } catch { }
                try { videoRef.current.focus(); } catch { }
            }

            // try to apply continuous autofocus if supported
            try {
                const track = stream.getVideoTracks()[0];
                if (track && typeof (track as any).applyConstraints === 'function') {
                    try {
                        // @ts-ignore - may not be supported
                        await (track as any).applyConstraints({ advanced: [{ focusMode: 'continuous' }] });
                    } catch (e) {
                        // ignore constraint errors
                    }
                }
            } catch (e) { }

            setIsCameraActive(true);
        } catch (e: any) {
            console.error('Camera start failed', e);
            setCameraError(e?.message || 'Camera access denied');
            setIsCameraActive(false);
        }
    };

    const stopCamera = () => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((t) => t.stop());
            streamRef.current = null;
        }
        if (videoRef.current) {
            try { videoRef.current.pause(); } catch { }
            videoRef.current.srcObject = null;
        }
        setIsCameraActive(false);
    };

    const capturePhoto = async () => {
        if (!videoRef.current) return;
        const video = videoRef.current;
        const w = video.videoWidth || 800;
        const h = video.videoHeight || 800;
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        if (cameraFacing === 'user') {
            // mirror horizontally for front camera
            ctx.translate(w, 0);
            ctx.scale(-1, 1);
            ctx.drawImage(video, 0, 0, w, h);
            // reset transform
            ctx.setTransform(1, 0, 0, 1, 0, 0);
        } else {
            ctx.drawImage(video, 0, 0, w, h);
        }
        return new Promise<void>((resolve) => {
            canvas.toBlob(async (blob) => {
                if (!blob) return resolve();
                const fileObj = new File([blob], `polaroid-${Date.now()}.png`, { type: blob.type });
                const optimized = await optimizeImage(fileObj, 1200, 1200, 0.82);
                setFile(optimized);
                setPreview(URL.createObjectURL(optimized));
                // stop camera after capture
                stopCamera();
                setMode('upload');
                resolve();
            }, 'image/png');
        });
    };

    const handleUpload = async () => {
        if (!file) return;
        setUploading(true);

        try {
            // Use Firebase Auth instead of legacy Supabase Auth
            const user = auth.currentUser;
            const firebaseUser = user as any; // Cast for custom properties if needed, but uid exists on User
            if (!user) throw new Error("No user linked to Firebase session");

            const coupleId = useOrbitStore.getState().couple?.id;
            if (!coupleId) throw new Error("No couple profile found in store");

            // Use timestamped filename to avoid storage RLS upsert restrictions.
            const fileName = `polaroids/${coupleId}/${Date.now()}.webp`;

            // Skip E2EE as requested
            const shouldEncrypt = false;
            const uploadBlob = file;
            const uploadContentType = file.type || "image/webp";

            // 1. Attempt R2 Upload if configured
            if (process.env.NEXT_PUBLIC_UPLOAD_URL && process.env.NEXT_PUBLIC_UPLOAD_SECRET) {
                try {
                    await uploadToR2(uploadBlob as Blob, 'memories', fileName, uploadContentType);
                } catch (r2Error) {
                    console.error('[Polaroid] R2 Upload failed:', r2Error);
                    throw r2Error;
                }
            } else {
                // Fallback to media proxy or throw if no cloud storage is ready
                throw new Error("No cloud storage configured for polaroids");
            }

            // Always store the relative token form in the DB
            const imageUrlForDb = fileName;

            // 1. Update Global Store immediately (Optimistic UI)
            const globalStore = useOrbitStore.getState();
            const optimisticPolaroid = {
                id: `opt-${Date.now()}`,
                image_url: imageUrlForDb,
                caption: caption,
                created_at: new Date().toISOString(),
                user_id: user.uid
            };
            globalStore.updatePolaroid(user.uid, user.uid, optimisticPolaroid);

            // 2. Trigger local callback if provided
            if (onSuccess) {
                onSuccess(optimisticPolaroid);
            }

            // 3. Close dialog immediately for "Instant" feel
            onOpenChange(false);
            setFile(null);
            setPreview(null);
            setCaption("");

            toast({
                title: "Polaroid sent!",
                variant: "success",
            });

            // 4. Sync to DB in the background
            void createPolaroid({
                imageUrl: imageUrlForDb,
                caption: caption
            }).then((res: any) => {
                // Once server confirms, update global store with real UUID row
                if (res?.success && res?.data) {
                    globalStore.updatePolaroid(user.uid, user.uid, res.data);
                    window.dispatchEvent(new Event('orbit:polaroid-refresh'));
                    window.dispatchEvent(new Event('orbit:dashboard-refresh'));
                }
            }).catch(() => {
                // If it fails, we keep the optimistic version; sync engines will handle reconciliation
            });

        } catch (error: any) {
            console.error("Polaroid upload failed:", error)
            toast({
                title: "Failed to send polaroid",
                variant: "destructive"
            });
        } finally {
            setUploading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent
                className={cn(
                    "w-[90vw] sm:w-[calc(100%-1.5rem)] sm:max-w-[425px] flex flex-col bg-neutral-950/95 backdrop-blur-md border border-white/20 text-white transition-[transform,opacity] duration-200 ease-out translate-x-[-50%] transform-gpu rounded-3xl p-0 gap-0 overflow-hidden shadow-[0_24px_80px_rgba(0,0,0,1)]",
                    "-translate-y-1/2"
                )}
                style={{ maxHeight: 'calc(var(--app-height, 100vh) * 0.85)' }}
            >
                <DialogHeader className="px-5 pt-4 pb-2 border-b border-white/10 bg-black/20">
                    <DialogTitle className="flex items-center gap-2 font-serif text-xl">
                        Snap a Polaroid
                    </DialogTitle>
                </DialogHeader>

                <div className="flex flex-col gap-3 px-4 sm:px-5 py-3 min-h-0 flex-1 overflow-y-auto scrollbar-hide">
                    <div className="flex gap-2">
                        <Button
                            variant={mode === 'camera' ? 'default' : 'ghost'}
                            onClick={async () => { setMode('camera'); await startCamera(); }}
                            className="flex-1 h-10"
                        >
                            Capture
                        </Button>
                        <Button
                            variant={mode === 'upload' ? 'default' : 'ghost'}
                            onClick={() => { setMode('upload'); stopCamera(); }}
                            className="flex-1 h-10"
                        >
                            Upload
                        </Button>
                    </div>
                    <div className="relative w-full flex-1 min-h-[300px] sm:min-h-[340px] max-h-[58svh] bg-black rounded-xl overflow-hidden border border-white/10 group">
                        {mode === 'camera' ? (
                            <>
                                <video
                                    ref={videoRef}
                                    autoPlay
                                    playsInline
                                    muted
                                    className={`absolute inset-0 w-full h-full object-cover ${cameraFacing === 'user' ? 'scale-x-[-1]' : ''}`}
                                />
                                {!isCameraActive && !file && !cameraError && (
                                    <div className="absolute inset-0 flex items-center justify-center bg-neutral-900 z-10">
                                        <Loader2 className="w-6 h-6 animate-spin text-neutral-500" />
                                    </div>
                                )}

                                {/* Camera Controls Panel */}
                                <div className="absolute bottom-4 left-0 right-0 z-20 flex justify-center items-center gap-6 pointer-events-none">
                                    <Button
                                        type="button"
                                        variant="secondary"
                                        size="icon"
                                        className="w-10 h-10 rounded-full bg-black/60 backdrop-blur-md border border-white/10 hover:bg-black/90 pointer-events-auto shadow-xl"
                                        onClick={() => {
                                            const newFacing = cameraFacing === 'user' ? 'environment' : 'user';
                                            setCameraFacing(newFacing);
                                            stopCamera();
                                            setTimeout(() => startCamera(newFacing), 100);
                                        }}
                                    >
                                        <RotateCw className="w-4 h-4 text-white" />
                                    </Button>

                                    <button
                                        type="button"
                                        onClick={capturePhoto}
                                        className="w-16 h-16 rounded-full border-2 border-white/40 bg-white/20 backdrop-blur-sm flex items-center justify-center hover:bg-white/20 transition-colors pointer-events-auto shadow-2xl"
                                    >
                                        <div className="w-12 h-12 rounded-full bg-white shadow-inner" />
                                    </button>

                                    <div className="w-10 h-10" /> {/* Spacer for symmetry */}
                                </div>
                            </>
                        ) : (
                            // Upload Mode
                            <div
                                className="absolute inset-0 cursor-pointer hover:bg-white/5 transition-colors"
                                onClick={() => fileInputRef.current?.click()}
                            >
                                {preview ? (
                                    <Image
                                        src={preview}
                                        alt="Preview"
                                        fill
                                        className="object-cover"
                                    />
                                ) : (
                                    <div className="h-full w-full flex items-center justify-center">
                                        <div className="flex flex-col items-center justify-center text-center">
                                            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center">
                                                <Upload className="w-6 h-6 text-neutral-400" />
                                            </div>
                                            <div className="mt-3 text-center">
                                                <p className="text-sm font-medium text-neutral-300">Tap to select photo</p>
                                                <p className="text-xs text-neutral-500 mt-1">Square format recommended</p>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileSelect}
                        className="hidden"
                        accept="image/*"
                    />

                    {mode === 'camera' && cameraError && (
                        <div className="w-full text-center text-xs text-rose-400 mt-2">
                            <div>{cameraError}</div>
                            <div className="mt-1 flex items-center justify-center gap-2">
                                <Button size="sm" onClick={() => startCamera()} className="h-8">Retry</Button>
                                <Button size="sm" variant="ghost" onClick={() => setMode('upload')} className="h-8">Upload Instead</Button>
                            </div>
                        </div>
                    )}

                    {mode === 'camera' && preview && (
                        <div className="flex gap-2 w-full">
                            <Button onClick={() => { setPreview(null); setFile(null); setMode('camera'); startCamera(); }} className="flex-1 h-12">Retake</Button>
                            <Button variant="ghost" onClick={() => { setMode('upload'); }} className="flex-1 h-12">Use Photo</Button>
                        </div>
                    )}

                    <div className="space-y-2 mt-1">
                        <Label className="text-[10px] uppercase tracking-widest text-white/40">Short Caption</Label>
                        <Input
                            placeholder="A sweet memory..."
                            value={caption}
                            maxLength={POLAROID_CAPTION_MAX_LENGTH}
                            onChange={(e) => setCaption(e.target.value.slice(0, POLAROID_CAPTION_MAX_LENGTH))}
                            className="bg-white/5 border-white/10"
                        />
                    </div>

                </div>

                <div className="px-4 sm:px-5 py-3 border-t border-white/10 bg-black/35">
                    <Button
                        onClick={handleUpload}
                        disabled={!file || uploading}
                        className="w-full h-12 bg-rose-600 hover:bg-rose-700 font-bold"
                    >
                        {uploading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : "Develop Image"}
                    </Button>
                </div>
            </DialogContent>
        </Dialog >
    );
}
