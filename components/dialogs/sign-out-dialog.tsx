"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { signOut } from '@/lib/client/auth';
import { MediaCacheEngine } from '@/lib/client/media-cache/engine';
import { useOrbitStore } from '@/lib/store/global-store';
import { Loader2 } from 'lucide-react';

interface SignOutDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function SignOutDialog({ open, onOpenChange }: SignOutDialogProps) {
    const router = useRouter();
    const { profile } = useOrbitStore();
    const [wipeLocalMedia, setWipeLocalMedia] = useState(false);
    const [loading, setLoading] = useState(false);

    const handleSignOut = async () => {
        setLoading(true);
        try {
            // 1. Clear Local Cache if requested
            if (wipeLocalMedia && profile?.id) {
                await MediaCacheEngine.wipeUserCache(profile.id);
            }

            // 2. Clear App PIN and associated states (Important for Native)
            localStorage.removeItem('orbit_app_pin');
            localStorage.removeItem('orbit_last_backgrounded');
            localStorage.removeItem('orbit_app_locked_state');
            localStorage.removeItem('orbit_app_biometric');
            sessionStorage.removeItem('orbit_session_active');
            sessionStorage.removeItem('orbit_is_locked');

            // 3. Clear Auth / Store
            await signOut();

            // 4. Redirect
            router.push('/');
            onOpenChange(false);
        } catch (error) {
            console.error('Sign out error:', error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent className="bg-[#04070d] border border-white/10 rounded-[1.75rem] w-[92vw] max-w-[390px] p-6 sm:p-7 gap-0 overflow-hidden">
                <AlertDialogHeader className="items-center text-center mb-5">
                    <div className="w-full bg-black/55 border border-white/5 px-4 py-3">
                        <AlertDialogTitle className="text-[44px] leading-none font-serif text-rose-400">Sign Out</AlertDialogTitle>
                    </div>
                    <AlertDialogDescription className="mt-4 text-white/70 text-[15px] font-semibold">
                        Are you sure you want to end your session?
                    </AlertDialogDescription>
                </AlertDialogHeader>

                <div className="flex flex-col items-center mb-7">
                    <label
                        htmlFor="clear-cache"
                        className="w-full flex items-center gap-3 px-4 py-3.5 cursor-pointer group bg-white/7 rounded-full border border-white/10 transition-all hover:bg-white/10 hover:border-white/15 active:scale-[0.99]"
                    >
                        <Checkbox
                            id="clear-cache"
                            checked={wipeLocalMedia}
                            onCheckedChange={(checked) => setWipeLocalMedia(checked === true)}
                            className="w-5 h-5 rounded-[6px] border-white/30 data-[state=checked]:bg-rose-500 data-[state=checked]:border-rose-400 transition-colors"
                        />
                        <span className="text-[14px] font-semibold text-white/90 leading-tight">
                            Clear local media cache on this device
                        </span>
                    </label>
                    <p className="text-[11px] text-white/35 mt-4 text-center px-4 leading-relaxed italic">
                        If unchecked, encrypted media will load instantly upon next login.
                    </p>
                </div>

                <AlertDialogFooter className="flex flex-col gap-2.5 w-full">
                    <AlertDialogCancel
                        className="w-full bg-transparent border-white/15 text-white/70 hover:text-white hover:bg-white/5 h-8 rounded-full uppercase tracking-[0.24em] text-[11px] font-black transition-all"
                    >
                        Cancel
                    </AlertDialogCancel>
                    <AlertDialogAction
                        onClick={(e) => {
                            e.preventDefault();
                            handleSignOut();
                        }}
                        disabled={loading}
                        className="w-full bg-rose-600 hover:bg-rose-500 text-white h-12 rounded-full uppercase tracking-[0.2em] text-[11px] font-black shadow-[0_10px_30px_rgba(225,29,72,0.2)] transition-all active:scale-95 border-none"
                    >
                        {loading ? (
                            <div className="flex items-center gap-2">
                                <Loader2 className="w-3 h-3 animate-spin" />
                                <span>Exiting...</span>
                            </div>
                        ) : (
                            'Sign Out'
                        )}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
