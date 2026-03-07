"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Heart } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { signUpClient } from "@/lib/firebase/auth-client";
import { normalizePairCode, stashPendingPairInvite } from "@/lib/client/pair-invite";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";

const scrollIntoView = (e: React.FocusEvent<HTMLInputElement>) =>
    setTimeout(() => e.target.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300);

function SignUpForm() {
    const [activeTab, setActiveTab] = useState<"account" | "profile">("account");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [displayName, setDisplayName] = useState("");
    const [gender, setGender] = useState("");
    const [birthday, setBirthday] = useState("");
    const [anniversary, setAnniversary] = useState("");
    const [isPending, setIsPending] = useState(false);
    const router = useRouter();
    const searchParams = useSearchParams();
    const { toast } = useToast();

    useEffect(() => {
        const pairFromLink = normalizePairCode(searchParams.get("pair") || "");
        if (pairFromLink) stashPendingPairInvite(pairFromLink);
    }, [searchParams]);

    const validateAccount = () => {
        if (!email || !password || !displayName) return false;
        if (password.length < 6) return false;
        return true;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!gender || !birthday) {
            if (activeTab === 'account' && validateAccount()) {
                setActiveTab('profile');
                return;
            }
            return;
        }
        setIsPending(true);
        const result = await signUpClient(email, password, displayName, gender, birthday || undefined, anniversary || undefined);
        if (result?.error) {
            toast({ title: "Error", description: result.error, variant: "destructive" });
            setIsPending(false);
        } else {
            router.push("/auth/sign-up-success");
        }
    };

    return (
        <main className="min-h-[100dvh] flex flex-col items-center justify-start sm:justify-center pt-24 sm:pt-8 pb-8 px-8 bg-[#09090b] font-sans selection:bg-rose-500/10 overflow-y-auto w-full">
            <div className="fixed top-0 left-0 right-0 bg-[#09090b] z-[9999]" style={{ height: 'env(safe-area-inset-top, 44px)' }} />

            <Card className="w-full max-w-[320px] border-none bg-transparent shadow-none mt-0">
                <CardHeader className="text-center space-y-8 pb-12 shrink-0">
                    <div className="mx-auto flex w-16 h-16 items-center justify-center rounded-full bg-white/5 border border-white/5 shadow-2xl">
                        <Heart className="w-8 h-8 text-rose-400 flex-shrink-0 animate-in fade-in duration-1000" strokeWidth={1.5} />
                    </div>
                    <div className="space-y-3">
                        <CardTitle className="text-3xl font-serif text-white tracking-tight animate-in slide-in-from-bottom-2 duration-700">Join Orbit</CardTitle>
                        <CardDescription className="text-white/40 text-[9px] uppercase tracking-[0.3em] font-black animate-in delay-200 fade-in duration-700">
                            Start your journey
                        </CardDescription>
                    </div>
                </CardHeader>

                <div className="w-full flex border-b border-white/[0.05] mb-12 shrink-0">
                    <button
                        type="button"
                        onClick={() => setActiveTab("account")}
                        className={cn(
                            "flex-1 py-4 text-[9px] font-black uppercase tracking-[0.2em] transition-all relative",
                            activeTab === "account" ? "text-white" : "text-white/10 hover:text-white/20"
                        )}
                    >
                        Account
                        {activeTab === "account" && <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-white/40" />}
                    </button>
                    <button
                        type="button"
                        onClick={() => { if (validateAccount()) setActiveTab("profile"); }}
                        className={cn(
                            "flex-1 py-4 text-[9px] font-black uppercase tracking-[0.2em] transition-all relative",
                            activeTab === "profile" ? "text-white" : "text-white/10 hover:text-white/20"
                        )}
                    >
                        Profile
                        {activeTab === "profile" && <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-white/40" />}
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="relative min-h-[420px]">
                    <AnimatePresence initial={false} mode="wait">
                        {activeTab === "account" ? (
                            <motion.div
                                key="account"
                                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="absolute inset-0 space-y-12"
                            >
                                <div className="space-y-10">
                                    <div className="space-y-4">
                                        <Label className="text-white/40 text-[8px] uppercase tracking-[0.2em] font-black ml-1">Name</Label>
                                        <Input placeholder="Display Name" value={displayName} onChange={e => setDisplayName(e.target.value)} onFocus={scrollIntoView} className="h-12 bg-transparent border-t-0 border-l-0 border-r-0 border-b border-white/10 text-white placeholder:text-white/5 rounded-none focus:border-white/30 transition-all px-1" required />
                                    </div>
                                    <div className="space-y-4">
                                        <Label className="text-white/40 text-[8px] uppercase tracking-[0.2em] font-black ml-1">Email</Label>
                                        <Input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} onFocus={scrollIntoView} className="h-12 bg-transparent border-t-0 border-l-0 border-r-0 border-b border-white/10 text-white placeholder:text-white/5 rounded-none focus:border-white/30 transition-all px-1" required />
                                    </div>
                                    <div className="space-y-4">
                                        <Label className="text-white/40 text-[8px] uppercase tracking-[0.2em] font-black ml-1">Password</Label>
                                        <Input type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} onFocus={scrollIntoView} className="h-12 bg-transparent border-t-0 border-l-0 border-r-0 border-b border-white/10 text-white placeholder:text-white/5 rounded-none focus:border-white/30 transition-all px-1" minLength={6} required />
                                    </div>
                                </div>
                                <Button type="button" onClick={() => { if (validateAccount()) setActiveTab("profile"); }} className="w-full h-14 bg-white text-black hover:bg-white/90 font-black text-[10px] uppercase tracking-[0.2em] rounded-none transition-all">
                                    Continue
                                </Button>
                            </motion.div>
                        ) : (
                            <motion.div
                                key="profile"
                                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="absolute inset-0 space-y-12"
                            >
                                <div className="space-y-10">
                                    <div className="grid grid-cols-2 gap-10">
                                        <div className="space-y-4">
                                            <Label className="text-white/40 text-[8px] uppercase tracking-[0.2em] font-black ml-1">Gender</Label>
                                            <Select value={gender} onValueChange={setGender}>
                                                <SelectTrigger className="h-12 bg-transparent border-t-0 border-l-0 border-r-0 border-b border-white/10 rounded-none text-white focus:ring-0 px-1 border-white/20">
                                                    <SelectValue placeholder="Select" />
                                                </SelectTrigger>
                                                <SelectContent className="bg-black border-white/10 text-white rounded-none">
                                                    <SelectItem value="male">Male</SelectItem>
                                                    <SelectItem value="female">Female</SelectItem>
                                                    <SelectItem value="other">Other</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-4">
                                            <Label className="text-white/40 text-[8px] uppercase tracking-[0.2em] font-black ml-1">Birthday</Label>
                                            <Input type="date" value={birthday} onChange={e => setBirthday(e.target.value)} onFocus={scrollIntoView} className="h-12 bg-transparent border-t-0 border-l-0 border-r-0 border-b border-white/10 text-white rounded-none focus:border-white/30 transition-all px-1" required />
                                        </div>
                                    </div>
                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between">
                                            <Label className="text-white/40 text-[8px] uppercase tracking-[0.2em] font-black ml-1">Anniversary</Label>
                                            <span className="text-[7px] text-white/5 uppercase tracking-widest font-black">Optional</span>
                                        </div>
                                        <Input type="date" value={anniversary} onChange={e => setAnniversary(e.target.value)} onFocus={scrollIntoView} className="h-12 bg-transparent border-t-0 border-l-0 border-r-0 border-b border-white/10 text-white rounded-none focus:border-white/30 transition-all px-1" />
                                    </div>
                                </div>
                                <div className="space-y-8">
                                    <Button type="submit" disabled={isPending} className="w-full h-14 bg-white text-black hover:bg-white/90 font-black text-[10px] uppercase tracking-[0.2em] rounded-none transition-all">
                                        {isPending ? "Connecting..." : "Create Account"}
                                    </Button>
                                    <button type="button" onClick={() => setActiveTab('account')} className="w-full text-[8px] text-white/10 uppercase tracking-[0.3em] font-black hover:text-white/30 transition-all text-center">
                                        Back to Account
                                    </button>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </form>

                <p className="text-[9px] text-white/10 text-center font-black mt-20 uppercase tracking-[0.3em] shrink-0">
                    Existing account?{' '}
                    <Link href="/auth/login" className="text-rose-400 hover:text-rose-300 transition-colors">
                        Sign in
                    </Link>
                </p>
            </Card>
        </main>
    );
}

export default function SignUpPage() {
    return (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-[#09090b]"><Heart className="w-6 h-6 text-white/5 animate-pulse" /></div>}>
            <SignUpForm />
        </Suspense>
    );
}
