"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Heart, Sparkles, LogOut, Loader2, Copy, Check, RefreshCw, Share2, UserPlus, Key, UserCheck, Orbit } from "lucide-react";
import { signOutClient } from "@/lib/firebase/auth-client";
import { generatePairCode, peekPairInvite, joinCouple } from "@/lib/firebase/pairing";
import { readPendingPairInvite, clearPendingPairInvite } from "@/lib/client/pair-invite";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Capacitor } from "@capacitor/core";
import { Share } from "@capacitor/share";

export function PairingWall({ user, initialCouple }: { user: any, initialCouple?: any }) {
    const [activeTab, setActiveTab] = useState<"generate" | "join">("generate");
    const [pairCode, setPairCode] = useState("");
    const [isPending, setIsPending] = useState(false);
    const [generatedCode, setGeneratedCode] = useState<string | null>(initialCouple?.couple_code || null);
    const [copied, setCopied] = useState(false);
    const [confirmation, setConfirmation] = useState<{ partnerName: string; code: string } | null>(null);
    const { toast } = useToast();
    const router = useRouter();

    // Check for stashed invitation on mount or URL params
    useEffect(() => {
        const searchParams = new URLSearchParams(window.location.search);
        const urlCode = searchParams.get('pair');
        const pending = readPendingPairInvite();
        const codeToVerify = urlCode || pending?.code;

        if (codeToVerify) {
            setActiveTab("join");
            setPairCode(codeToVerify);

            const autoVerify = async () => {
                setIsPending(true);
                const res = await peekPairInvite(codeToVerify);
                setIsPending(false);

                // CRITICAL: Always clear the invite immediately so failures don't loop
                clearPendingPairInvite();

                if (res.success && res.partner_display_name) {
                    setConfirmation({ partnerName: res.partner_display_name, code: codeToVerify });
                } else if (res.error) {
                    toast({
                        title: "Identification Failed",
                        description: res.error || "Could not fetch partner name.",
                        variant: "destructive"
                    });
                }

                // Clean up URL
                window.history.replaceState({}, '', window.location.pathname);
            };
            autoVerify();
        }
    }, [toast]);

    const handleGenerate = async (force: boolean = false) => {
        setIsPending(true);
        const res = await generatePairCode(force);
        setIsPending(false);
        if (res.success && res.pairCode) {
            setGeneratedCode(res.pairCode);
            if (force) {
                toast({ title: "New code generated" });
            }
        } else {
            toast({
                title: "Failed to generate code",
                description: res.error || "An unknown error occurred.",
                variant: "destructive"
            });
        }
    };

    const handleInitialJoin = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!pairCode || pairCode.length < 6) return;

        setIsPending(true);
        const res = await peekPairInvite(pairCode);
        setIsPending(false);

        if (res.success && res.partner_display_name) {
            setConfirmation({ partnerName: res.partner_display_name, code: pairCode });
        } else {
            // If verification fails, clear everything so we don't get stuck
            setConfirmation(null);
            clearPendingPairInvite();
            toast({
                title: "Verification Failed",
                description: res.error || "Check the code and try again.",
                variant: "destructive"
            });
        }
    };

    const confirmJoin = async () => {
        if (!confirmation) return;
        setIsPending(true);
        const res = await joinCouple(confirmation.code);
        setIsPending(false);

        // CRITICAL: Always clear the invitation task once we've attempted a join
        clearPendingPairInvite();

        if ('success' in res && res.success) {
            window.location.href = '/dashboard';
        } else {
            const errorMsg = 'error' in res ? res.error : 'Connection failed';
            toast({ title: "Connection failed", description: errorMsg, variant: "destructive" });
            setConfirmation(null);
        }
    };

    const copyToClipboard = () => {
        if (!generatedCode) return;
        navigator.clipboard.writeText(generatedCode);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleShare = async () => {
        if (!generatedCode) return;
        const shareUrl = `${window.location.origin}/auth/sign-up?pair=${generatedCode}`;
        const text = `Connect with me on Orbit. Visit this link to join my universe:`;

        try {
            if (Capacitor.isNativePlatform()) {
                await Share.share({ title: 'Orbit Connection', text, url: shareUrl });
            } else if (navigator.share) {
                await navigator.share({ title: 'Orbit Connection', text, url: shareUrl });
            } else {
                navigator.clipboard.writeText(shareUrl);
                setCopied(true);
                toast({ title: "Link copied to clipboard" });
                setTimeout(() => setCopied(false), 2000);
            }
        } catch (err) {
            navigator.clipboard.writeText(shareUrl);
        }
    };

    return (
        <div className="min-h-screen w-full flex flex-col items-center justify-center p-8 bg-[#09090b] font-sans selection:bg-rose-500/10 overflow-hidden relative">
            {/* Background Ambient Glow */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-rose-500/5 rounded-full blur-[120px] pointer-events-none" />

            <svg width="0" height="0" className="absolute">
                <defs>
                    <linearGradient id="heartGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#f472b6" />
                        <stop offset="50%" stopColor="#e2556f" />
                        <stop offset="100%" stopColor="#d98b75" />
                    </linearGradient>
                </defs>
            </svg>

            <div className="w-full max-w-[320px] flex flex-col items-center relative z-10">
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-14 shrink-0"
                >
                    <Heart className="w-8 h-8 opacity-80" style={{ fill: 'url(#heartGradient)' }} strokeWidth={0} />
                </motion.div>

                {!confirmation ? (
                    <motion.div
                        key="main-ui"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="w-full"
                    >
                        <div className="text-center mb-16 space-y-4 shrink-0">
                            <h1 className="text-4xl font-serif text-white tracking-tight animate-in slide-in-from-bottom-2 duration-700">Connect to Orbit</h1>
                            <p className="text-white/20 text-[9px] uppercase tracking-[0.3em] font-black animate-in delay-200 fade-in duration-700">
                                Shared space awaits
                            </p>
                        </div>

                        {/* Fixed Switcher */}
                        <div className="w-full flex border-b border-white/[0.05] mb-16 shrink-0">
                            <button onClick={() => setActiveTab("generate")} className={cn("flex-1 py-4 text-[9px] font-black uppercase tracking-[0.2em] transition-all relative", activeTab === "generate" ? "text-white" : "text-white/10 hover:text-white/20")}>
                                Generate
                                {activeTab === "generate" && <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-white/40" />}
                            </button>
                            <button onClick={() => setActiveTab("join")} className={cn("flex-1 py-4 text-[9px] font-black uppercase tracking-[0.2em] transition-all relative", activeTab === "join" ? "text-white" : "text-white/10 hover:text-white/20")}>
                                Join
                                {activeTab === "join" && <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-white/40" />}
                            </button>
                        </div>

                        <div className="w-full h-[320px] relative overflow-hidden">
                            <AnimatePresence initial={false} mode="wait">
                                {activeTab === "generate" ? (
                                    <motion.div key="generate" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="absolute inset-0 flex flex-col items-center">
                                        {!generatedCode ? (
                                            <div className="w-full space-y-12 text-center pt-8">
                                                <p className="text-white/20 text-[9px] uppercase tracking-widest font-black leading-relaxed mx-auto max-w-[180px]">
                                                    Generate a code to invite Partner
                                                </p>
                                                <Button onClick={() => handleGenerate()} disabled={isPending} className="h-14 w-full bg-white text-black hover:bg-white/90 rounded-none font-black text-[10px] uppercase tracking-[0.2em]">
                                                    {isPending ? "Generating..." : "Generate Code"}
                                                </Button>
                                            </div>
                                        ) : (
                                            <div className="w-full space-y-12 flex flex-col items-center">
                                                <div className="w-full h-32 border border-white/[0.05] flex items-center justify-center relative group cursor-pointer" onClick={copyToClipboard}>
                                                    <span className="text-4xl font-mono font-black tracking-[0.25em] text-white pl-[0.25em] opacity-90 group-hover:opacity-100 transition-opacity">
                                                        {generatedCode}
                                                    </span>
                                                    {copied && (
                                                        <div className="absolute bottom-3 text-[8px] uppercase tracking-widest font-black text-white/40">Copied</div>
                                                    )}
                                                </div>
                                                <div className="w-full space-y-6">
                                                    <Button onClick={handleShare} className="w-full h-14 bg-white text-black hover:bg-white/90 rounded-none font-black text-[10px] uppercase tracking-[0.2em] gap-3">
                                                        <Share2 className="w-3.5 h-3.5" />
                                                        Share Link
                                                    </Button>
                                                    <div className="flex flex-col items-center gap-4">
                                                        <button onClick={() => window.location.reload()} className="w-full py-2 text-white/10 hover:text-white/30 text-[8px] font-black uppercase tracking-[0.3em] transition-colors">
                                                            Refresh Status
                                                        </button>
                                                        <button onClick={() => handleGenerate(true)} className="text-white/5 hover:text-white/20 text-[7px] font-black uppercase tracking-[0.4em] transition-colors">
                                                            Regenerate New Code
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </motion.div>
                                ) : (
                                    <motion.div key="join" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="absolute inset-0 flex flex-col items-center">
                                        {isPending && (
                                            <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#09090b]/80 backdrop-blur-sm space-y-4">
                                                <Loader2 className="w-6 h-6 text-white/20 animate-spin" />
                                                <p className="text-[8px] text-white/20 uppercase tracking-[0.3em] font-black">Verifying Code...</p>
                                            </div>
                                        )}
                                        <div className="w-full space-y-10 flex flex-col items-center pt-4">
                                            <p className="text-white/20 text-[9px] uppercase tracking-widest font-black text-center">
                                                Enter partner code
                                            </p>
                                            <form onSubmit={handleInitialJoin} className="w-full space-y-12">
                                                <Input value={pairCode} onChange={(e) => setPairCode(e.target.value.toUpperCase())} placeholder="••••••" maxLength={6} className="h-20 text-center text-4xl font-mono font-bold tracking-[0.3em] bg-transparent border-t-0 border-l-0 border-r-0 border-b border-white/10 rounded-none focus:border-white/40 transition-all text-white placeholder:text-white/5" />
                                                <Button type="submit" disabled={pairCode.length < 6 || isPending} className="h-14 w-full bg-white text-black hover:bg-white/90 rounded-none font-black text-[10px] uppercase tracking-[0.2em]">
                                                    {isPending ? "Checking..." : "Verify Code"}
                                                </Button>
                                            </form>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </motion.div>
                ) : (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="w-full min-h-[480px] flex flex-col items-center justify-center text-center py-4"
                    >
                        <div className="relative mb-12">
                            <div className="absolute inset-0 bg-rose-500/20 blur-2xl rounded-full scale-150" />
                            <div className="relative w-20 h-20 border border-white/10 flex items-center justify-center p-6 grayscale opacity-80">
                                <UserCheck className="w-full h-full text-white" strokeWidth={1} />
                            </div>
                            <motion.div
                                animate={{ rotate: 360 }}
                                transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                                className="absolute -inset-4 border border-white/[0.03] border-dashed rounded-full"
                            />
                        </div>

                        <div className="space-y-6 max-w-[280px]">
                            <h2 className="text-3xl font-serif text-white tracking-tight leading-tight">
                                Connect with <span className="text-rose-400 italic font-medium">{confirmation.partnerName}</span>?
                            </h2>
                            <p className="text-white/20 text-[10px] uppercase tracking-[0.2em] font-black leading-relaxed">
                                Orbits are about to merge. This links timelines, memories, and space forever.
                            </p>
                        </div>

                        <div className="w-full space-y-8 pt-16">
                            <Button onClick={confirmJoin} disabled={isPending} className="w-full h-16 bg-white text-black hover:bg-white/90 rounded-none font-black text-[11px] uppercase tracking-[0.25em] transition-all active:scale-[0.98]">
                                {isPending ? "Connecting..." : "Confirm Connection"}
                            </Button>

                            <div className="flex flex-col items-center gap-6">
                                <button
                                    onClick={() => { setConfirmation(null); clearPendingPairInvite(); }}
                                    className="text-white/10 hover:text-white/30 text-[9px] font-black uppercase tracking-[0.3em] transition-colors"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}

                <button
                    onClick={async () => {
                        await signOutClient();
                        router.replace('/auth/login');
                    }}
                    className="mt-20 text-white/5 text-[9px] uppercase tracking-[0.4em] font-black hover:text-white/20 transition-colors shrink-0"
                >
                    Sign Out
                </button>
            </div>
        </div>
    );
}
