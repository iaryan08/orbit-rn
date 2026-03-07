"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Settings, User, Heart, Calendar, LogOut, Copy, Check, Camera, Loader2, Upload, Lock, Download, Shield, Delete, ArrowRight, Sparkles, ShieldCheck, Pencil, X, Shuffle, Wind, Layers, Circle, Moon, Sun, Target, Zap } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";
import { optimizeImage } from "@/lib/image-optimization";
import { setCustomWallpaper, getCustomWallpaper, clearCustomWallpaper } from "@/lib/idb";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { Capacitor } from "@capacitor/core";
import { NativeBiometric } from "capacitor-native-biometric";
import { triggerHaptic } from "@/lib/client/haptics";
import { cn } from "@/lib/utils";
import { detectPerformanceMode, setPerformanceMode, type PerformanceMode } from "@/lib/client/performance-mode";
import { getPublicStorageUrl, uploadToR2, deleteFromR2, extractFilePathFromStorageUrl } from "@/lib/storage";
import { useApkUpdater } from "@/hooks/updater/useApkUpdater";
import {
    hasStoredMediaPassphrase,
    isE2EEEnabled,
    setE2EEEnabled,
    clearStoredMediaPassphrase,
    createRecoveryKitBlob,
    importRecoveryKit
} from "@/lib/client/crypto-e2ee";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { SignOutDialog } from "@/components/dialogs/sign-out-dialog"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useOrbitStore } from "@/lib/store/global-store";
import { useAppMode } from "@/components/app-mode-context";
import { SectionHeader } from "@/components/section-header";
import { db, auth } from "@/lib/firebase/client";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { updatePassword, reauthenticateWithCredential, EmailAuthProvider } from "firebase/auth";
import { createPortal } from "react-dom";

interface Profile {
    id: string;
    display_name: string;
    avatar_url: string | null;
    birthday?: string | null;
    custom_wallpaper_url?: string | null;
    couple_id: string | null;
    gender: string | null;
    updated_at?: any | null;
    wallpaper_overlay_type?: 'dark' | 'light' | null;
    wallpaper_grayscale?: boolean | null;
    wallpaper_mode?: 'theme' | 'custom' | 'black' | 'random' | 'shared' | null;
    wallpaper_mode_updated_at?: string | null;
    partner_id?: string | null;
    email?: string | null;
    partner_nickname?: string | null;
}

interface Couple {
    id: string;
    couple_code: string;
    anniversary_date: string | null;
    couple_name: string | null;
    user1_id: string;
    user2_id: string | null;
    updated_at?: any | null;
}

export default function SettingsPage() {
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [uploadingWallpaper, setUploadingWallpaper] = useState(false);
    const [copied, setCopied] = useState(false);

    const [displayName, setDisplayName] = useState("");
    const [gender, setGender] = useState("");
    const [birthday, setBirthday] = useState("");
    const [coupleName, setCoupleName] = useState("");
    const [anniversaryDate, setAnniversaryDate] = useState("");
    const [partnerNickname, setPartnerNickname] = useState("");

    const [activeTab, setActiveTab] = useState<'profile' | 'couple' | 'atmosphere' | 'security' | 'updates'>('profile');
    const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
    const [showSaveProfileConfirm, setShowSaveProfileConfirm] = useState(false);
    const [showSaveCoupleConfirm, setShowSaveCoupleConfirm] = useState(false);
    const [showWallpaperDeleteConfirm, setShowWallpaperDeleteConfirm] = useState(false);

    const [showCustomControls, setShowCustomControls] = useState(false);
    const [localWallpaperUrl, setLocalWallpaperUrl] = useState<string | null>(null);
    const [sharedWallpaperUrl, setSharedWallpaperUrl] = useState<string | null>(null);
    const [performanceMode, setPerformanceModeState] = useState<PerformanceMode>('default');

    const fileInputRef = useRef<HTMLInputElement>(null);
    const wallpaperInputRef = useRef<HTMLInputElement>(null);
    const { toast } = useToast();
    const router = useRouter();
    const { checkForApkUpdate, downloadLatestApkForWeb, isChecking, isNative } = useApkUpdater();

    const profile = useOrbitStore(state => state.profile) as Profile | null;
    const couple = useOrbitStore(state => state.couple) as Couple | null;
    const partnerProfile = useOrbitStore(state => state.partnerProfile) as Profile | null;
    const appMode = useAppMode();
    const mode = appMode?.mode || 'default';

    useEffect(() => {
        if (profile) {
            setDisplayName(profile.display_name || "");
            setGender(profile.gender || "");
            setBirthday(profile.birthday || "");
            setPartnerNickname(profile.partner_nickname || "");
        }
    }, [profile]);

    useEffect(() => {
        if (couple) {
            setCoupleName(couple.couple_name || "");
            setAnniversaryDate(couple.anniversary_date || "");
        }
    }, [couple]);

    // Atmosphere variant state
    type OverlayStyle = 'default' | 'A' | 'B' | 'AB';
    const [overlayStyle, setOverlayStyleState] = useState<OverlayStyle>('default');
    type SpaceOverlay = 'default' | 'spark' | 'deep' | 'glow';
    const [spaceOverlay, setSpaceOverlayState] = useState<SpaceOverlay>('default');

    useEffect(() => {
        if (typeof window === 'undefined') return;
        setPerformanceModeState(detectPerformanceMode());
        const saved = (localStorage.getItem('orbit:overlay_style') as OverlayStyle) || 'default';
        setOverlayStyleState(saved);
        const savedSpace = (localStorage.getItem('orbit:space_overlay') as SpaceOverlay) || 'default';
        setSpaceOverlayState(savedSpace);

        const loadLocal = async () => {
            const custom = await getCustomWallpaper();
            if (custom) setLocalWallpaperUrl(custom);

            const shared = localStorage.getItem('orbit:wallpaper_shared_url');
            if (shared) setSharedWallpaperUrl(shared);
        };
        loadLocal();
    }, []);

    const updateOverlayStyle = (style: OverlayStyle) => {
        setOverlayStyleState(style);
        localStorage.setItem('orbit:overlay_style', style);
        window.dispatchEvent(new CustomEvent('orbit-theme-sync'));
    };

    const updateSpaceOverlay = (style: SpaceOverlay) => {
        setSpaceOverlayState(style);
        localStorage.setItem('orbit:space_overlay', style);
        window.dispatchEvent(new CustomEvent('orbit-theme-sync'));
    };

    const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
        if (!event.target.files || event.target.files.length === 0 || !profile) return;
        const file = event.target.files[0];
        setUploading(true);
        try {
            const optimizedFile = await optimizeImage(file, 400, 400, 0.9);
            const avatarPath = `profiles/${profile.id}/avatar-${Date.now()}.webp`;

            // Use R2 for uploads to avoid Firebase limits
            await uploadToR2(optimizedFile, 'avatars', avatarPath, 'image/webp');

            if (profile.avatar_url) {
                const oldRef = extractFilePathFromStorageUrl(profile.avatar_url, 'avatars');
                if (oldRef) await deleteFromR2('avatars', oldRef);
            }

            await updateDoc(doc(db, 'users', profile.id), {
                avatar_url: avatarPath,
                updated_at: serverTimestamp()
            });

            toast({ title: "Photo updated ", variant: "success" });
        } catch (error) {
            toast({ title: "Photo upload failed", variant: "destructive" });
        } finally {
            setUploading(false);
        }
    };

    const handleWallpaperSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
        if (!event.target.files || event.target.files.length === 0 || !profile) return;
        const file = event.target.files[0];
        setUploadingWallpaper(true);
        try {
            const optimizedFile = await optimizeImage(file, 1080, 1920, 0.85);

            const reader = new FileReader();
            reader.readAsDataURL(optimizedFile);
            reader.onload = async () => {
                const base64 = reader.result as string;
                await setCustomWallpaper(base64);
                setLocalWallpaperUrl(base64);
            };

            const filePath = `profiles/${profile.id}/wallpaper-${Date.now()}.webp`;

            await uploadToR2(optimizedFile, 'avatars', filePath, 'image/webp');

            if (profile.custom_wallpaper_url) {
                const oldRef = extractFilePathFromStorageUrl(profile.custom_wallpaper_url, 'avatars');
                if (oldRef) await deleteFromR2('avatars', oldRef);
            }

            await updateDoc(doc(db, 'users', profile.id), {
                custom_wallpaper_url: filePath,
                wallpaper_mode: 'custom',
                wallpaper_mode_updated_at: new Date().toISOString(),
                updated_at: serverTimestamp()
            });

            window.dispatchEvent(new CustomEvent('orbit-theme-sync'));
            localStorage.setItem('orbit_wallpaper_mode', 'custom');
            toast({ title: "Atmosphere updated ", variant: "success" });
        } catch (error) {
            toast({ title: "Atmosphere sync failed", variant: "destructive" });
        } finally {
            setUploadingWallpaper(false);
        }
    };

    const updateGrayscale = async (grayscale: boolean) => {
        if (!profile) return;
        localStorage.setItem('orbit_global_monochrome', String(grayscale));
        window.dispatchEvent(new CustomEvent('orbit-theme-sync'));
        try {
            await updateDoc(doc(db, 'users', profile.id), {
                wallpaper_grayscale: grayscale,
                updated_at: serverTimestamp()
            });
        } catch (e) {
            toast({ title: "Atmosphere refinement failed", variant: "destructive" });
        }
    };

    const updateWallpaperMode = async (wMode: string) => {
        if (!profile) return;
        localStorage.setItem('orbit_wallpaper_mode', wMode);
        window.dispatchEvent(new CustomEvent('orbit-theme-sync'));
        try {
            await updateDoc(doc(db, 'users', profile.id), {
                wallpaper_mode: wMode,
                wallpaper_mode_updated_at: new Date().toISOString(),
                updated_at: serverTimestamp()
            });
        } catch (e) {
            toast({ title: "Atmosphere refinement failed", variant: "destructive" });
        }
    };

    const updatePerformanceMode = (pMode: PerformanceMode) => {
        const applied = setPerformanceMode(pMode);
        setPerformanceModeState(applied);
        window.dispatchEvent(new CustomEvent('orbit:performance-mode-changed', { detail: { mode: applied } }));
        toast({ title: applied === 'lite' ? "Lite Performance Enabled" : "Default Performance Enabled", variant: "success" });
    };

    const saveProfile = async () => {
        if (!profile) return;
        setSaving(true);
        try {
            await updateDoc(doc(db, 'users', profile.id), {
                display_name: displayName,
                gender: gender || null,
                birthday: birthday || null,
                partner_nickname: partnerNickname || null,
                updated_at: serverTimestamp()
            });
            toast({ title: "Profile saved ", variant: "success" });
            setShowSaveProfileConfirm(false);
        } catch (error) {
            toast({ title: "Failed to save profile", variant: "destructive" });
        } finally {
            setSaving(false);
        }
    };

    const saveCoupleSettings = async () => {
        if (!couple) return;
        setSaving(true);
        try {
            await updateDoc(doc(db, 'couples', couple.id), {
                couple_name: coupleName || null,
                anniversary_date: anniversaryDate || null,
                updated_at: serverTimestamp()
            });
            toast({ title: "Space synchronized ", variant: "success" });
            setShowSaveCoupleConfirm(false);
        } catch (error) {
            toast({ title: "Failed to synchronize space", variant: "destructive" });
        } finally {
            setSaving(false);
        }
    };

    const clearCustomWallpaperImage = async () => {
        if (!profile) return;
        setLoading(true);
        try {
            if (profile.custom_wallpaper_url) {
                const path = extractFilePathFromStorageUrl(profile.custom_wallpaper_url, 'avatars');
                if (path) await deleteFromR2('avatars', path);
            }
            await updateDoc(doc(db, 'users', profile.id), {
                custom_wallpaper_url: null,
                updated_at: serverTimestamp()
            });
            await clearCustomWallpaper();
            window.dispatchEvent(new CustomEvent('orbit-theme-sync'));
            toast({ title: "Custom image removed", variant: "success" });
            setShowWallpaperDeleteConfirm(false);
        } catch (e) {
            toast({ title: "Failed to remove image", variant: "destructive" });
        } finally {
            setLoading(false);
        }
    };

    const copyPairCode = () => {
        if (!couple?.couple_code) return;
        navigator.clipboard.writeText(couple.couple_code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const isMale = gender?.toLowerCase() === 'male';
    const themeText = isMale ? 'text-blue-400' : 'text-rose-400';
    const themeIconColor = isMale ? 'text-blue-400' : 'text-rose-400';

    const tabs = [
        { id: 'profile', label: 'Personal Information', icon: User },
        { id: 'couple', label: 'Space & Connection', icon: Heart },
        { id: 'atmosphere', label: 'Atmosphere', icon: Camera },
        { id: 'security', label: 'Privacy & Security', icon: Shield },
        { id: 'updates', label: 'App & Data', icon: Zap },
    ];

    const partnerHeaderName = partnerProfile?.display_name?.split(' ')[0] || 'Partner';

    return (
        <div className={cn(
            "max-w-7xl mx-auto space-y-6 md:space-y-12 pt-24 md:pt-12 pb-6 md:pb-12 px-0 md:px-8 relative",
            isNative ? "pt-16" : ""
        )}>
            <SectionHeader title="Settings" label="Configuration" className="mb-8 md:mb-12" />

            {/* Top Profile Card */}
            <div className="bg-white/[0.07] border border-white/10 rounded-[2.5rem] p-6 md:p-8 relative overflow-hidden flex items-center justify-between mb-10 mx-auto shadow-2xl max-w-[90vw] w-full">
                <div className="flex items-center gap-5">
                    <div className="relative">
                        <Avatar className={cn("w-16 h-16 md:w-20 md:h-20 border-[3px] border-neutral-800 transition-colors", isMale ? "border-blue-900" : "border-rose-950")}>
                            <AvatarImage src={getPublicStorageUrl(profile?.avatar_url, 'avatars') || "/images/placeholder.png"} className="object-cover" />
                            <AvatarFallback className={cn("text-2xl font-serif bg-neutral-900", isMale ? "text-blue-200" : "text-rose-200")}>
                                {profile?.display_name?.charAt(0) || "U"}
                            </AvatarFallback>
                        </Avatar>
                        <div className={cn("absolute bottom-0 right-0 rounded-full p-1 border-2 border-black/80", isMale ? "bg-blue-500" : "bg-emerald-500")}>
                            <Shield className="w-3 h-3 text-white" />
                        </div>
                    </div>
                    <div className="flex flex-col">
                        <h3 className="text-[22px] font-serif text-white">{profile?.display_name?.split(' ')[0] || "User"}</h3>
                        <p className={cn("text-[11px] font-bold tracking-wider mt-0.5", themeText, "opacity-80")}>{profile?.email?.split('@')[0] || "Verified Account"}</p>
                    </div>
                </div>
                <button
                    onClick={() => {
                        setActiveTab('profile');
                        setTimeout(() => document.getElementById('settings-content')?.scrollIntoView({ behavior: 'auto', block: 'start' }), 50);
                    }}
                    className="bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 rounded-full p-4 transition-colors"
                >
                    <Pencil className="w-[18px] h-[18px] text-white/60" />
                </button>
            </div>

            <div className="mb-8 md:mb-12">
                <div className="flex flex-col bg-transparent overflow-hidden">
                    {tabs.map((tab) => {
                        const isActive = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => {
                                    setActiveTab(tab.id as any);
                                    document.getElementById('settings-content')?.scrollIntoView({ behavior: 'auto', block: 'start' });
                                }}
                                className="flex items-center justify-between px-6 py-5 md:py-6 transition-all border-b border-white/[0.03] last:border-b-0 group"
                            >
                                <div className="flex items-center gap-5">
                                    <div className={cn(
                                        "p-3 rounded-full flex items-center justify-center transition-all duration-300 border shadow-inner",
                                        isActive
                                            ? (tab.id === 'profile' ? (isMale ? "bg-blue-500/20 text-blue-400 border-blue-500/40" : "bg-rose-500/20 text-rose-400 border-rose-500/40")
                                                : (tab.id === 'atmosphere' ? "bg-indigo-500/20 text-indigo-400 border-indigo-500/40"
                                                    : (tab.id === 'couple' ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                                                        : (tab.id === 'security' ? "bg-amber-500/20 text-amber-400 border-amber-500/40"
                                                            : "bg-purple-500/20 text-purple-400 border-purple-500/40"))))
                                            : "bg-white/10 text-white/30 border-white/10 group-hover:bg-white/10 group-hover:text-white/60"
                                    )}>
                                        <tab.icon className="w-5 h-5 shrink-0" />
                                    </div>
                                    <span className={cn("text-[15px] font-serif tracking-wide transition-colors", isActive ? "text-white" : "text-white/40 group-hover:text-white")}>{tab.label}</span>
                                </div>
                                <ArrowRight className={cn("w-4 h-4 transition-all duration-300", isActive ? "text-white opacity-100 translate-x-1" : "opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0")} />
                            </button>
                        )
                    })}
                </div>
            </div>

            <div id="settings-content" className="relative scroll-mt-24 pt-2">
                <AnimatePresence mode="wait">
                    {activeTab === 'profile' && (
                        <motion.div key="profile" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="bg-transparent p-6 md:p-10 space-y-8">
                            <div className="flex flex-col items-center gap-6">
                                <div className="relative group">
                                    <Avatar className={cn("w-28 h-28 border-[3px] border-neutral-800 transition-colors shadow-2xl", isMale ? "group-hover:border-blue-400/50" : "group-hover:border-rose-400/50")}>
                                        <AvatarImage src={getPublicStorageUrl(profile?.avatar_url, 'avatars') || "/images/placeholder.png"} className="object-cover" />
                                        <AvatarFallback className={cn("text-3xl font-serif bg-neutral-900", isMale ? "text-blue-200" : "text-rose-200")}>{profile?.display_name?.charAt(0) || "U"}</AvatarFallback>
                                    </Avatar>
                                    <div onClick={() => fileInputRef.current?.click()} className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                                        <Camera className="w-8 h-8 text-white" />
                                    </div>
                                    {uploading && <div className="absolute inset-0 flex items-center justify-center bg-neutral-900/80 rounded-full z-10"><Loader2 className={cn("w-8 h-8 animate-spin", themeIconColor)} /></div>}
                                </div>
                                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />
                            </div>

                            <div className="space-y-6">
                                <div>
                                    <Label className="text-white/40 font-serif italic uppercase tracking-[0.4em] text-[10px] mb-3 block ml-1">Display Name</Label>
                                    <Input value={displayName} onChange={e => setDisplayName(e.target.value)} className={cn("border border-white/10 bg-white/5 text-white text-base md:text-lg rounded-3xl px-4 py-6 md:py-3", isMale ? "focus-visible:ring-blue-500/50" : "focus-visible:ring-rose-500/50")} />
                                </div>
                                <div>
                                    <Label className="text-white/40 font-serif italic uppercase tracking-[0.4em] text-[10px] mb-3 block ml-1">Gender Identity</Label>
                                    <Select value={gender} onValueChange={setGender}>
                                        <SelectTrigger className="w-full border border-white/10 bg-white/5 text-white rounded-3xl h-auto py-3"><SelectValue placeholder="Select gender" /></SelectTrigger>
                                        <SelectContent className="bg-neutral-950 border-white/10 text-white rounded-3xl">
                                            <SelectItem value="male" className="focus:bg-blue-500/20 focus:text-blue-200">Male</SelectItem>
                                            <SelectItem value="female" className="focus:bg-rose-500/20 focus:text-rose-200">Female</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div>
                                    <Label className="text-white/40 font-serif italic uppercase tracking-[0.4em] text-[10px] mb-3 block ml-1">Birthday</Label>
                                    <Input type="date" value={birthday} onChange={e => setBirthday(e.target.value)} className={cn("border border-white/10 bg-white/5 text-white rounded-3xl py-3 [color-scheme:dark]", isMale ? "focus-visible:ring-blue-500/50" : "focus-visible:ring-rose-500/50")} />
                                </div>
                                <Button onClick={() => setShowSaveProfileConfirm(true)} disabled={saving} className="w-full sm:w-auto bg-neutral-900 border border-neutral-700 hover:bg-neutral-800 text-white rounded-full px-8 py-6 uppercase tracking-widest text-[10px] font-black">{saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> SAVING...</> : "SAVE IDENTITY"}</Button>
                            </div>
                        </motion.div>
                    )}

                    {activeTab === 'atmosphere' && (
                        <motion.div key="atmosphere" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="bg-transparent p-6 md:p-10 space-y-8">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h2 className="text-2xl font-serif text-white flex items-center gap-3">Atmosphere <Sparkles className="w-4 h-4 text-blue-400" /></h2>
                                    <p className="text-white/40 text-[11px] uppercase tracking-widest mt-1">Personalize the private celestial space</p>
                                </div>
                                <Moon className="w-4 h-4 text-white/60" />
                            </div>

                            <input ref={wallpaperInputRef} type="file" accept="image/*" className="hidden" onChange={handleWallpaperSelect} />

                            <div className="space-y-5">
                                <p className="text-white/40 text-[10px] font-serif italic uppercase tracking-[0.3em]">Background Mode</p>
                                <div className="grid grid-cols-3 gap-3 max-w-lg">
                                    <button onClick={() => updateWallpaperMode('black')} className={cn("group relative aspect-square rounded-3xl border-2 transition-all flex items-center justify-center bg-black overflow-hidden", (profile?.wallpaper_mode === 'black') ? (mode === 'moon' ? "border-rose-500 shadow-rose-500/20 scale-105" : "border-purple-500 shadow-purple-500/20 scale-105") : "border-white/5 opacity-60")}>
                                        <Sparkles className={cn("w-10 h-10", (profile?.wallpaper_mode === 'black') ? (mode === 'moon' ? "text-rose-400" : "text-purple-400") : "text-white/20")} />
                                        <div className="absolute bottom-3 text-[10px] font-black uppercase text-white">Space</div>
                                    </button>

                                    <div className={cn("group relative aspect-square rounded-3xl border-2 transition-all overflow-hidden", profile?.wallpaper_mode === 'custom' ? (mode === 'moon' ? "border-rose-500 shadow-rose-500/20 scale-105" : "border-purple-500 shadow-purple-500/20 scale-105") : "border-white/5 opacity-60")}>
                                        {profile?.custom_wallpaper_url ? (
                                            <>
                                                <Image src={localWallpaperUrl || getPublicStorageUrl(profile.custom_wallpaper_url, 'avatars') || "/images/placeholder.png"} alt="Custom" fill className="object-cover" onClick={() => { updateWallpaperMode('custom'); setShowCustomControls(!showCustomControls); }} />
                                                <div className={cn("absolute top-2 inset-x-2 flex justify-between transition-all duration-300 z-20", showCustomControls ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-4 pointer-events-none")}>
                                                    <button onClick={e => { e.stopPropagation(); wallpaperInputRef.current?.click(); }} className="w-10 h-10 rounded-full bg-black/80 flex items-center justify-center border border-white/20"><Pencil className="w-4 h-4 text-white" /></button>
                                                    <button onClick={e => { e.stopPropagation(); setShowWallpaperDeleteConfirm(true); }} className="w-10 h-10 rounded-full bg-rose-500 flex items-center justify-center border border-rose-400/50"><X className="w-4 h-4 text-white" /></button>
                                                </div>
                                            </>
                                        ) : (
                                            <div onClick={() => wallpaperInputRef.current?.click()} className="w-full h-full flex flex-col items-center justify-center bg-neutral-900 gap-2 cursor-pointer">
                                                <Camera className="w-10 h-10 text-white/40" />
                                                <span className="text-[9px] uppercase text-white/40">Upload</span>
                                            </div>
                                        )}
                                    </div>

                                    <button disabled={!partnerProfile?.custom_wallpaper_url} onClick={() => updateWallpaperMode('shared')} className={cn("group relative aspect-square rounded-3xl border-2 transition-all overflow-hidden", profile?.wallpaper_mode === 'shared' ? (mode === 'moon' ? "border-rose-500 shadow-rose-500/20 scale-105" : "border-purple-500 shadow-purple-500/20 scale-105") : "border-white/5 opacity-60", !partnerProfile?.custom_wallpaper_url && "opacity-20 cursor-not-allowed")}>
                                        {partnerProfile?.custom_wallpaper_url ? (
                                            <>
                                                <Image src={sharedWallpaperUrl || getPublicStorageUrl(partnerProfile.custom_wallpaper_url, 'avatars') || "/images/placeholder.png"} alt="Shared" fill className="object-cover" />
                                                <div className="absolute inset-x-0 bottom-3 text-[10px] font-serif italic text-white text-center truncate px-1">{partnerHeaderName}</div>
                                            </>
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center bg-neutral-900"><Heart className="w-10 h-10 text-white/20" /></div>
                                        )}
                                    </button>
                                </div>
                            </div>

                            <div className="flex items-center justify-between py-6 border-b border-white/[0.03]">
                                <div className="flex items-center gap-5">
                                    <div className={cn("p-3 rounded-full border shadow-inner transition-all", profile?.wallpaper_grayscale ? "bg-rose-500/20 text-rose-400 border-rose-500/40" : "bg-white/10 text-white/30 border-white/10")}>{profile?.wallpaper_grayscale ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}</div>
                                    <div>
                                        <p className="text-white text-[15px] font-serif">Monochrome Mode</p>
                                        <p className="text-white/30 text-[9px] uppercase italic tracking-wider">Classic black & white vibe</p>
                                    </div>
                                </div>
                                <button onClick={() => updateGrayscale(!profile?.wallpaper_grayscale)} className={cn("relative w-16 h-8 rounded-full border p-1 transition-all", profile?.wallpaper_grayscale ? (mode === 'moon' ? "bg-rose-950/40 border-rose-500/30" : "bg-purple-950/40 border-purple-500/30") : "bg-black/40 border-white/10")}>
                                    <motion.div animate={{ x: profile?.wallpaper_grayscale ? 32 : 0 }} className="w-6 h-6 rounded-full bg-white shadow-lg" />
                                </button>
                            </div>

                            <PartnerWallpaperSync wallpaperMode={profile?.wallpaper_mode || 'black'} partnerProfile={partnerProfile} />

                            <div className="py-6 border-b border-white/[0.03] space-y-6">
                                <div className="flex items-center gap-5">
                                    <div className="p-3 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center"><Sparkles className="w-5 h-5" /></div>
                                    <div>
                                        <span className="text-[15px] font-serif text-white">Aesthetic Filtering</span>
                                        <p className="text-[9px] text-white/30 uppercase italic tracking-wider">Atmospheric Depth</p>
                                    </div>
                                </div>
                                <div className="px-1 md:pl-16">
                                    {(profile?.wallpaper_mode === 'custom' || profile?.wallpaper_mode === 'shared') && !profile?.wallpaper_grayscale ? (
                                        <div className="grid grid-cols-4 w-full gap-2 max-w-xl">
                                            {([
                                                { key: 'default', label: 'Natural', icon: Circle, color: 'text-emerald-400' },
                                                { key: 'spark', label: 'Glass', icon: Wind, color: 'text-blue-400' },
                                                { key: 'deep', label: 'Tint', icon: Layers, color: 'text-purple-400' },
                                                { key: 'glow', label: 'Pro', icon: Sparkles, color: 'text-amber-400' },
                                            ] as const).map(opt => (
                                                <button key={opt.key} onClick={() => {
                                                    const styleMap: Record<string, 'default' | 'A' | 'B' | 'AB'> = { 'default': 'default', 'spark': 'A', 'deep': 'B', 'glow': 'AB' };
                                                    updateOverlayStyle(styleMap[opt.key]);
                                                }} className={cn("flex flex-col items-center gap-2 py-4 border rounded-3xl transition-all duration-500", overlayStyle === (opt.key === 'default' ? 'default' : opt.key === 'spark' ? 'A' : opt.key === 'deep' ? 'B' : 'AB') ? "bg-white/10 border-white/20 shadow-xl scale-[1.02]" : "bg-white/[0.02] border-transparent opacity-60 hover:opacity-100")}>
                                                    <opt.icon className={cn("w-7 h-7 mb-1", overlayStyle === (opt.key === 'default' ? 'default' : opt.key === 'spark' ? 'A' : opt.key === 'deep' ? 'B' : 'AB') ? opt.color : "text-white/80")} />
                                                    <span className="text-[8px] uppercase font-serif italic tracking-widest">{opt.label}</span>
                                                </button>
                                            ))}
                                        </div>
                                    ) : <p className="py-2 text-[9px] text-white/20 uppercase font-black tracking-widest">{profile?.wallpaper_grayscale ? "Depth Locked for Monochrome" : "Depth Optimized for Space"}</p>}
                                </div>
                            </div>

                            <div className="flex items-center justify-between py-6">
                                <div className="flex items-center gap-5">
                                    <div className="p-3 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center"><Zap className="w-5 h-5" /></div>
                                    <p className="text-white text-[15px] font-serif">Performance Engine</p>
                                </div>
                                <div className="relative flex w-40 h-10 rounded-full border border-white/10 bg-black/40 p-1">
                                    <motion.div animate={{ x: performanceMode === 'default' ? 0 : 76 }} className={cn("absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-full shadow-xl transition-colors duration-500", performanceMode === 'default' ? (mode === 'moon' ? "bg-rose-500" : "bg-purple-500") : "bg-emerald-500")} />
                                    <button onClick={() => updatePerformanceMode('default')} className={cn("relative flex-1 z-10 text-[9px] font-serif italic uppercase tracking-widest transition-colors", performanceMode === 'default' ? "text-white" : "text-white/30")}>Max</button>
                                    <button onClick={() => updatePerformanceMode('lite')} className={cn("relative flex-1 z-10 text-[9px] font-serif italic uppercase tracking-widest transition-colors", performanceMode === 'lite' ? "text-white" : "text-white/30")}>Lite</button>
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {activeTab === 'couple' && (
                        <motion.div key="couple" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="bg-transparent p-6 md:p-10 space-y-8">
                            {!couple ? (
                                <div className="text-center py-10 space-y-4">
                                    <div className="bg-rose-500/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto border border-rose-500/20"><Heart className="w-8 h-8 text-rose-400/60" /></div>
                                    <h3 className="text-xl font-serif text-white">No Active Connection</h3>
                                    <Button onClick={() => router.push('/dashboard')} className="bg-rose-500/20 text-rose-300 border border-rose-500/30 rounded-full px-6 py-2 text-[10px] font-black uppercase tracking-widest mt-4">Go to Dashboard</Button>
                                </div>
                            ) : (
                                <>
                                    <div className="mb-6"><h2 className="text-2xl font-serif text-white">{displayName || "User"}</h2><p className="text-white/40 text-[11px]">Manage shared details and anniversary.</p></div>
                                    <div>
                                        <Label className="text-white/40 font-serif italic uppercase tracking-[0.4em] text-[10px] mb-3 block ml-1">Partner Nickname</Label>
                                        <Input
                                            value={partnerNickname}
                                            onChange={e => setPartnerNickname(e.target.value)}
                                            placeholder="e.g. My Love, Bubba..."
                                            className="border border-white/10 bg-white/5 text-white text-base md:text-lg rounded-3xl py-3 focus-visible:ring-rose-500/50"
                                        />
                                        <p className="text-[10px] text-white/30 mt-2 ml-1 italic">This nickname is just for you – your partner won't see it (unless you show them!)</p>
                                    </div>
                                    <div className="mt-6">
                                        <Label className="text-white/40 font-serif italic uppercase tracking-[0.4em] text-[10px] mb-3 block ml-1">Space Name</Label>
                                        <Input value={coupleName} onChange={e => setCoupleName(e.target.value)} className="border border-white/10 bg-white/5 text-white text-base md:text-lg rounded-3xl py-3 focus-visible:ring-rose-500/50" />
                                    </div>
                                    <div><Label className="text-white/40 font-serif italic uppercase tracking-[0.4em] text-[10px] mb-3 block ml-1">Anniversary</Label><Input type="date" value={anniversaryDate} onChange={e => setAnniversaryDate(e.target.value)} className="border border-white/10 bg-white/5 text-white text-base md:text-lg rounded-3xl py-3 focus-visible:ring-rose-500/50 [color-scheme:dark]" /></div>
                                    <div className="py-6 border-y border-white/[0.03] mt-8 flex items-center justify-between">
                                        <div><Label className="text-white/40 uppercase tracking-[0.4em] text-[10px] mb-1 block">Connection Code</Label><span className="font-mono text-2xl text-rose-300 tracking-[0.2em]">{couple?.couple_code}</span></div>
                                        <Button variant="ghost" size="icon" onClick={copyPairCode} className="w-12 h-12 rounded-full bg-white/[0.03] hover:bg-white/[0.1] text-white/50">{copied ? <Check className="h-5 w-5 text-emerald-400" /> : <Copy className="h-5 w-5" />}</Button>
                                    </div>
                                    <Button onClick={() => setShowSaveCoupleConfirm(true)} disabled={saving} className="w-full sm:w-auto bg-neutral-900 border border-neutral-700 hover:bg-neutral-800 text-white rounded-full px-8 py-6 uppercase tracking-widest text-[10px] font-black">{saving ? <Loader2 className="animate-spin" /> : "SYNCHRONIZE"}</Button>
                                </>
                            )}
                        </motion.div>
                    )}

                    {activeTab === 'security' && (
                        <motion.div key="security" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
                            <div className="bg-transparent p-6 md:p-10 mt-6"><ChangePasswordPanel /></div>
                            <div className="bg-transparent p-6 md:p-10 mt-6"><AppLockSettingsPanel isNative={isNative} /></div>
                        </motion.div>
                    )}

                    {activeTab === 'updates' && (
                        <motion.div key="updates" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="bg-transparent p-6 md:p-10 flex flex-col items-center text-center">
                            <h2 className="text-[22px] font-serif text-rose-50 mb-8">System Updates</h2>
                            <Button onClick={async () => {
                                if (isNative) { await checkForApkUpdate(); return; }
                                const opened = await downloadLatestApkForWeb();
                                if (!opened) toast({ title: "Update not available", variant: "destructive" });
                            }} disabled={isChecking} className="bg-neutral-900 border border-neutral-700 text-white rounded-full px-8 py-6 uppercase tracking-widest text-[10px] font-black flex items-center gap-2">
                                {isChecking && <Loader2 className="w-4 h-4 animate-spin" />}
                                {isChecking ? "Checking..." : (isNative ? "Check For Updates" : "Download System APK")}
                            </Button>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            <div className="mt-12 mb-8 flex justify-center w-full px-0 sm:px-6">
                <Button variant="celestial-rose" onClick={() => setShowSignOutConfirm(true)} className="w-auto min-w-[190px] h-11 px-7 flex items-center justify-center gap-2 text-[10px] tracking-[0.2em] bg-rose-500/12 border border-rose-500/25"><LogOut className="w-4 h-4" /> SIGN OUT</Button>
            </div>

            <SignOutDialog open={showSignOutConfirm} onOpenChange={setShowSignOutConfirm} />

            <AlertDialog open={showSaveProfileConfirm} onOpenChange={setShowSaveProfileConfirm}>
                <AlertDialogContent className="bg-neutral-950 border-white/10"><AlertDialogHeader><AlertDialogTitle>Save Identity</AlertDialogTitle><AlertDialogDescription>Update your core profile configurations.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={saveProfile} variant="celestial-rose">Confirm</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={showSaveCoupleConfirm} onOpenChange={setShowSaveCoupleConfirm}>
                <AlertDialogContent className="bg-neutral-950 border-white/10"><AlertDialogHeader><AlertDialogTitle>Synchronize Space</AlertDialogTitle><AlertDialogDescription>Push these changes to {partnerHeaderName}'s device as well.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={saveCoupleSettings} variant="celestial-rose">Synchronize</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={showWallpaperDeleteConfirm} onOpenChange={setShowWallpaperDeleteConfirm}>
                <AlertDialogContent className="bg-neutral-950 border-white/10"><AlertDialogHeader><AlertDialogTitle>Clear Atmosphere?</AlertDialogTitle><AlertDialogDescription>Permanently remove custom background image.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Keep it</AlertDialogCancel><AlertDialogAction onClick={clearCustomWallpaperImage} variant="celestial-rose">Clear Now</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

function ChangePasswordPanel() {
    const [current, setCurrent] = useState("");
    const [newPw, setNewPw] = useState("");
    const [confirmPw, setConfirmPw] = useState("");
    const [saving, setSaving] = useState(false);
    const [e2eeEnabled, setE2EEEnabledState] = useState(true);
    const { toast } = useToast();

    useEffect(() => {
        setE2EEEnabledState(isE2EEEnabled());
    }, []);

    const handleUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (newPw !== confirmPw) { toast({ title: "Passwords match fail", variant: "destructive" }); return; }
        if (newPw.length < 6) { toast({ title: "Password too short", variant: "destructive" }); return; }

        setSaving(true);
        try {
            const user = auth.currentUser;
            if (!user?.email) throw new Error("No user email");
            const credential = EmailAuthProvider.credential(user.email, current);
            await reauthenticateWithCredential(user, credential);
            await updatePassword(user, newPw);
            toast({ title: "Password updated successfully", variant: "success" });
            setCurrent(""); setNewPw(""); setConfirmPw("");
        } catch (error: any) {
            toast({ title: error.message || "Update failed", variant: "destructive" });
        } finally {
            setSaving(false);
        }
    };

    const exportKit = () => {
        try {
            const blob = createRecoveryKitBlob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `orbit-recovery-${new Date().toISOString().slice(0, 10)}.json`;
            a.click();
            toast({ title: "Recovery kit exported", variant: "success" });
        } catch (e: any) { toast({ title: "Export failed", variant: "destructive" }); }
    };

    const importKit = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        importRecoveryKit(file).then(() => {
            toast({ title: "Recovery kit imported", variant: "success" });
        }).catch(() => {
            toast({ title: "Import failed", variant: "destructive" });
        });
    };

    return (
        <div className="space-y-8 max-w-sm mx-auto">
            <h2 className="text-xl font-serif text-white mb-4">Account Security</h2>
            <form onSubmit={handleUpdate} className="space-y-5">
                <div><Label className="text-white/40 uppercase tracking-widest text-[10px] mb-2 block">Current Password</Label><Input type="password" value={current} onChange={e => setCurrent(e.target.value)} className="border-white/10 bg-white/5 rounded-3xl h-11" required /></div>
                <div><Label className="text-white/40 uppercase tracking-widest text-[10px] mb-2 block">New Password</Label><Input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} className="border-white/10 bg-white/5 rounded-3xl h-11" required /></div>
                <div><Label className="text-white/40 uppercase tracking-widest text-[10px] mb-2 block">Confirm Protocol</Label><Input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} className="border-white/10 bg-white/5 rounded-3xl h-11" required /></div>
                <Button type="submit" disabled={saving} className="bg-neutral-900 border border-neutral-700 text-white rounded-full px-8 py-6 uppercase text-[10px] font-black">{saving ? <Loader2 className="animate-spin" /> : "Update Protocol"}</Button>
            </form>

            <div className="pt-8 border-t border-white/5 space-y-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <ShieldCheck className="w-5 h-5 text-emerald-400" />
                        <span className="text-sm font-serif text-white">End-to-End Encryption</span>
                    </div>
                    <button onClick={() => { const n = !e2eeEnabled; setE2EEEnabled(n); setE2EEEnabledState(n); }} className={cn("w-12 h-6 rounded-full relative transition-all", e2eeEnabled ? "bg-emerald-500/50" : "bg-neutral-800")}>
                        <div className={cn("absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-all", e2eeEnabled && "translate-x-6")} />
                    </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <Button onClick={exportKit} variant="outline" className="rounded-2xl border-white/10 bg-white/5 text-[10px] uppercase font-bold tracking-widest py-6"><Download className="w-3 h-3 mr-2" /> Backup</Button>
                    <Button onClick={() => document.getElementById('kit-import')?.click()} variant="outline" className="rounded-2xl border-white/10 bg-white/5 text-[10px] uppercase font-bold tracking-widest py-6"><Upload className="w-3 h-3 mr-2" /> Restore</Button>
                    <input id="kit-import" type="file" className="hidden" onChange={importKit} />
                </div>
            </div>
        </div>
    );
}

function AppLockSettingsPanel({ isNative }: { isNative: boolean }) {
    const [pinMode, setPinMode] = useState<'create' | 'verify' | 'idle' | 'off' | 'change'>('idle');
    const [pinEntry, setPinEntry] = useState('');
    const [firstPin, setFirstPin] = useState('');
    const [errorShake, setErrorShake] = useState(false);
    const [hasExistingPin, setHasExistingPin] = useState(false);
    const [isBiometricEnabled, setIsBiometricEnabled] = useState(false);
    const { toast } = useToast();

    useEffect(() => {
        setHasExistingPin(!!localStorage.getItem('orbit_app_pin'));
        setIsBiometricEnabled(localStorage.getItem('orbit_app_biometric') === 'true');
        setPinMode('off');
    }, []);

    const handleChar = (num: string) => {
        triggerHaptic('light');
        if (pinEntry.length < 4) {
            const newVal = pinEntry + num;
            setPinEntry(newVal);
            if (newVal.length === 4) {
                if (pinMode === 'create' && !firstPin) { setFirstPin(newVal); setPinEntry(''); }
                else if (pinMode === 'create' && firstPin) {
                    if (newVal === firstPin) { localStorage.setItem('orbit_app_pin', newVal); setHasExistingPin(true); setPinMode('off'); toast({ title: "PIN Set Success", variant: "success" }); }
                    else { triggerHaptic('error'); setErrorShake(true); setTimeout(() => { setErrorShake(false); setFirstPin(''); setPinEntry(''); }, 500); }
                } else if (pinMode === 'verify') {
                    if (newVal === localStorage.getItem('orbit_app_pin')) { localStorage.removeItem('orbit_app_pin'); setHasExistingPin(false); setPinMode('off'); toast({ title: "Lock Disabled", variant: "success" }); }
                    else { triggerHaptic('error'); setErrorShake(true); setTimeout(() => { setErrorShake(false); setPinEntry(''); }, 500); }
                }
            }
        }
    };

    const handleBiometricToggle = async () => {
        if (!isNative) return;
        try {
            const avail = await NativeBiometric.isAvailable();
            if (!avail.isAvailable) return;
            await NativeBiometric.verifyIdentity({ reason: "Confirm security", title: "Authorize" });
            const next = !isBiometricEnabled;
            setIsBiometricEnabled(next);
            localStorage.setItem('orbit_app_biometric', String(next));
            toast({ title: next ? "Biometrics Enabled" : "Biometrics Disabled", variant: "success" });
        } catch (e) { toast({ title: "Verification failed", variant: "destructive" }); }
    };

    if (!isNative) return <p className="text-white/40 text-[11px] text-center italic">Protection suite requires mobile hardware.</p>;

    return (
        <>
            <div className="flex flex-col gap-6 text-center">
                <h2 className="text-xl font-serif text-white">App Protection</h2>
                <div className="flex flex-col items-center gap-3">
                    <Button onClick={() => setPinMode(hasExistingPin ? 'verify' : 'create')} variant={hasExistingPin ? 'destructive' : 'default'} className="rounded-full px-12 py-5 uppercase text-[10px] font-black">{hasExistingPin ? "Disable Lock" : "Setup Lock"}</Button>
                    {hasExistingPin && (
                        <div className="w-full max-w-xs pt-4 border-t border-white/5 flex items-center justify-between">
                            <span className="text-white font-serif">Biometric Unlock</span>
                            <button onClick={handleBiometricToggle} className={cn("w-12 h-6 rounded-full relative transition-all", isBiometricEnabled ? "bg-emerald-500/50" : "bg-neutral-800")}>
                                <div className={cn("absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-all", isBiometricEnabled && "translate-x-6")} />
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {pinMode !== 'off' && pinMode !== 'idle' && typeof document !== 'undefined' && createPortal(
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 z-[99999] bg-black/95 flex flex-col items-center justify-center p-6">
                    <h3 className="text-white font-serif text-2xl mb-8">{pinMode === 'verify' ? "Enter PIN" : firstPin ? "Confirm PIN" : "New PIN"}</h3>
                    <motion.div animate={errorShake ? { x: [-10, 10, -10, 10, 0] } : {}} className="flex gap-4 mb-12">
                        {[...Array(4)].map((_, i) => <div key={i} className={cn("w-4 h-4 rounded-full border border-white/20 transition-all", i < pinEntry.length ? "bg-white scale-110" : "bg-transparent")} />)}
                    </motion.div>
                    <div className="grid grid-cols-3 gap-6">
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 'skip', 0].map((num, i) => (
                            <button key={i} onClick={() => num !== 'skip' && handleChar(String(num))} className={cn("w-16 h-16 rounded-full flex items-center justify-center text-xl text-white font-medium bg-white/5 border border-white/5 active:bg-white/10", num === 'skip' && "invisible")}>{num}</button>
                        ))}
                        <button onClick={() => setPinEntry(prev => prev.slice(0, -1))} className="w-16 h-16 rounded-full flex items-center justify-center text-white/40"><Delete /></button>
                    </div>
                    <button onClick={() => setPinMode('off')} className="mt-12 text-white/30 text-[10px] uppercase font-bold tracking-widest">Cancel</button>
                </motion.div>,
                document.body
            )}
        </>
    );
}

function PartnerWallpaperSync({ wallpaperMode, partnerProfile }: { wallpaperMode: string, partnerProfile: any }) {
    useEffect(() => {
        if (wallpaperMode !== 'shared' || !partnerProfile?.custom_wallpaper_url) return;
        const url = getPublicStorageUrl(partnerProfile.custom_wallpaper_url, 'avatars');
        if (url) localStorage.setItem('orbit:wallpaper_shared_url', url);
        window.dispatchEvent(new CustomEvent('orbit-theme-sync'));
    }, [partnerProfile, wallpaperMode]);
    return null;
}
