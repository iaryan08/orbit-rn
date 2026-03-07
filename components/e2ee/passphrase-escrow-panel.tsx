"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    ShieldCheck,
    ShieldOff,
    Lock,
    Unlock,
    Eye,
    EyeOff,
    KeyRound,
    Loader2,
    AlertTriangle,
    CheckCircle2,
    Cloud,
    CloudOff,
    RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
    createEscrowBlob,
    decryptEscrowBlob,
    hasStoredMediaPassphrase,
    getKeyFingerprint,
    type EscrowBlob,
} from "@/lib/client/crypto-e2ee";
import { orbitFetch } from "@/lib/client/network";
import { cn } from "@/lib/utils";

type EscrowStatus =
    | "checking"
    | "not_setup"        // key exists locally, but no escrow on server yet
    | "active"           // key exists locally AND escrow exists on server
    | "needs_restore"    // no local key, but escrow exists on server
    | "no_key_no_escrow" // nothing anywhere
    | "error";

interface EscrowInfo {
    escrowBlob: EscrowBlob | null;
    fingerprintHex: string | null;
}

/**
 * PassphraseEscrowPanel
 *
 * Shows the user their cloud key escrow status and lets them:
 *   A) Set up a Recovery Passphrase to create server-side escrow
 *   B) Recover their key from server escrow using their passphrase
 */
export function PassphraseEscrowPanel() {
    const [escrowStatus, setEscrowStatus] = useState<EscrowStatus>("checking");
    const [serverEscrow, setServerEscrow] = useState<EscrowInfo>({
        escrowBlob: null,
        fingerprintHex: null,
    });
    const [mode, setMode] = useState<"idle" | "setup" | "recover">("idle");
    const [passphrase, setPassphrase] = useState("");
    const [passphraseConfirm, setPassphraseConfirm] = useState("");
    const [showPassphrase, setShowPassphrase] = useState(false);
    const [working, setWorking] = useState(false);
    const [error, setError] = useState("");
    const { toast } = useToast();

    useEffect(() => {
        checkStatus();
    }, []);

    async function checkStatus() {
        setEscrowStatus("checking");
        try {
            const res = await orbitFetch("/api/e2ee/escrow");
            if (!res.ok) throw new Error("Server error");
            const data: EscrowInfo = await res.json();
            setServerEscrow(data);

            const hasLocalKey = hasStoredMediaPassphrase();
            const hasServerEscrow = !!data.escrowBlob;

            if (hasLocalKey && hasServerEscrow) {
                setEscrowStatus("active");
            } else if (hasLocalKey && !hasServerEscrow) {
                setEscrowStatus("not_setup");
            } else if (!hasLocalKey && hasServerEscrow) {
                setEscrowStatus("needs_restore");
            } else {
                setEscrowStatus("no_key_no_escrow");
            }
        } catch {
            setEscrowStatus("error");
        }
    }

    async function handleSetup() {
        setError("");
        if (passphrase.length < 8) {
            setError("Passphrase must be at least 8 characters.");
            return;
        }
        if (passphrase !== passphraseConfirm) {
            setError("Passphrases don't match.");
            return;
        }
        setWorking(true);
        try {
            // This is CPU-heavy (600K PBKDF2 iterations) — runs in the main thread
            // but is non-blocking via WebCrypto
            const blob = await createEscrowBlob(passphrase);
            const res = await orbitFetch("/api/e2ee/escrow", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ escrowBlob: blob }),
            });
            if (!res.ok) {
                const { error: msg } = await res.json().catch(() => ({ error: "Server error" }));
                throw new Error(msg || "Failed to save escrow.");
            }
            toast({ title: "Cloud Recovery set up ✓", variant: "success" });
            setMode("idle");
            setPassphrase("");
            setPassphraseConfirm("");
            setEscrowStatus("active");
            setServerEscrow({ escrowBlob: blob, fingerprintHex: blob.fingerprintHex });
        } catch (e: any) {
            setError(e?.message || "Setup failed. Please try again.");
        } finally {
            setWorking(false);
        }
    }

    async function handleRecover() {
        setError("");
        if (!passphrase) {
            setError("Please enter your Recovery Passphrase.");
            return;
        }
        if (!serverEscrow.escrowBlob) {
            setError("No escrow blob found on server.");
            return;
        }
        setWorking(true);
        try {
            await decryptEscrowBlob(serverEscrow.escrowBlob, passphrase);
            toast({ title: "Key Recovered ✓ — Memories Unlocked", variant: "success" });
            setMode("idle");
            setPassphrase("");
            setEscrowStatus("active");
        } catch (e: any) {
            setError(e?.message || "Recovery failed. Check your passphrase.");
        } finally {
            setWorking(false);
        }
    }

    function handleCancel() {
        setMode("idle");
        setPassphrase("");
        setPassphraseConfirm("");
        setError("");
    }

    const matchState =
        passphraseConfirm.length > 0
            ? passphrase === passphraseConfirm
                ? "match"
                : "mismatch"
            : "neutral";

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center gap-3">
                <div
                    className={cn(
                        "w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0",
                        escrowStatus === "active"
                            ? "bg-emerald-500/15 ring-1 ring-emerald-500/30"
                            : escrowStatus === "needs_restore"
                                ? "bg-amber-500/15 ring-1 ring-amber-500/30"
                                : escrowStatus === "not_setup"
                                    ? "bg-white/10 ring-1 ring-white/15"
                                    : "bg-rose-500/10 ring-1 ring-rose-500/20"
                    )}
                >
                    {escrowStatus === "checking" ? (
                        <Loader2 className="w-4 h-4 text-white/30 animate-spin" />
                    ) : escrowStatus === "active" ? (
                        <Cloud className="w-4 h-4 text-emerald-400" />
                    ) : escrowStatus === "needs_restore" ? (
                        <CloudOff className="w-4 h-4 text-amber-400" />
                    ) : (
                        <CloudOff className="w-4 h-4 text-white/30" />
                    )}
                </div>
                <div className="flex-1">
                    <p className="text-[10px] font-black uppercase tracking-[0.25em] text-white/60">
                        Cloud Recovery
                    </p>
                    <p
                        className={cn(
                            "text-[11px] font-medium mt-0.5",
                            escrowStatus === "active"
                                ? "text-emerald-400"
                                : escrowStatus === "needs_restore"
                                    ? "text-amber-400"
                                    : "text-white/30"
                        )}
                    >
                        {escrowStatus === "checking" && "Checking server…"}
                        {escrowStatus === "active" && "Escrow active — recoverable with passphrase"}
                        {escrowStatus === "not_setup" && "Not configured — set up now to enable recovery"}
                        {escrowStatus === "needs_restore" && "Escrow found — enter passphrase to restore key"}
                        {escrowStatus === "no_key_no_escrow" && "No key and no escrow found"}
                        {escrowStatus === "error" && "Could not reach server"}
                    </p>
                </div>
                <button
                    onClick={checkStatus}
                    className="p-1.5 text-white/20 hover:text-white/50 transition-colors"
                    title="Refresh status"
                >
                    <RefreshCw
                        className={cn(
                            "w-3.5 h-3.5",
                            escrowStatus === "checking" && "animate-spin"
                        )}
                    />
                </button>
            </div>

            {/* Info box: how it works */}
            <div className="bg-white/[0.02] border border-white/5 rounded-xl p-3 space-y-1.5">
                <p className="text-[10px] text-white/25 leading-relaxed">
                    <span className="text-white/50 font-semibold">How it works:</span> Your key is encrypted locally with your chosen passphrase using PBKDF2 + AES-256-GCM (600,000 iterations). The server stores only encrypted noise — even we cannot read your key. Only your passphrase unlocks it.
                </p>
            </div>

            {/* Action buttons (idle mode) */}
            <AnimatePresence mode="wait">
                {mode === "idle" && (
                    <motion.div
                        key="idle"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="flex flex-col gap-2"
                    >
                        {(escrowStatus === "not_setup" || escrowStatus === "active") && (
                            <Button
                                type="button"
                                onClick={() => { setMode("setup"); setError(""); }}
                                className={cn(
                                    "w-full h-11 rounded-xl border text-[10px] font-black uppercase tracking-[0.2em] gap-2 transition-all",
                                    escrowStatus === "active"
                                        ? "bg-white/5 hover:bg-white/10 border-white/10 text-white/50 hover:text-white/80"
                                        : "bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/25 text-emerald-300"
                                )}
                            >
                                <KeyRound className="w-3.5 h-3.5" />
                                {escrowStatus === "active" ? "Change Recovery Passphrase" : "Set Up Cloud Recovery"}
                            </Button>
                        )}
                        {escrowStatus === "needs_restore" && (
                            <Button
                                type="button"
                                onClick={() => { setMode("recover"); setError(""); }}
                                className="w-full h-11 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/25 text-amber-300 text-[10px] font-black uppercase tracking-[0.2em] gap-2"
                            >
                                <Unlock className="w-3.5 h-3.5" />
                                Recover Key with Passphrase
                            </Button>
                        )}
                        {escrowStatus === "error" && (
                            <Button
                                type="button"
                                onClick={checkStatus}
                                className="w-full h-11 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/40 text-[10px] font-black uppercase tracking-[0.2em] gap-2"
                            >
                                <RefreshCw className="w-3.5 h-3.5" />
                                Retry
                            </Button>
                        )}
                    </motion.div>
                )}

                {/* Setup form */}
                {mode === "setup" && (
                    <motion.div
                        key="setup"
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        className="space-y-3"
                    >
                        <div className="bg-amber-500/5 border border-amber-500/15 rounded-xl p-3 flex items-start gap-2">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
                            <p className="text-[10px] text-amber-200/60 leading-relaxed">
                                Choose a strong passphrase you won't forget. <span className="font-semibold text-amber-300">If you lose both your device and this passphrase, your encrypted memories are permanently lost.</span>
                            </p>
                        </div>

                        <PassphraseInput
                            label="Recovery Passphrase"
                            value={passphrase}
                            onChange={(v) => { setPassphrase(v); setError(""); }}
                            show={showPassphrase}
                            onToggleShow={() => setShowPassphrase((s) => !s)}
                            placeholder="e.g. Purple-Orbit-Starfish-2024"
                            hint="Min. 8 chars. Use a phrase, not just a word."
                        />
                        <PassphraseInput
                            label="Confirm Passphrase"
                            value={passphraseConfirm}
                            onChange={(v) => { setPassphraseConfirm(v); setError(""); }}
                            show={showPassphrase}
                            onToggleShow={() => setShowPassphrase((s) => !s)}
                            placeholder="Repeat your passphrase"
                            matchState={matchState}
                        />
                        {error && (
                            <p className="text-[10px] text-rose-400 flex items-center gap-1.5 font-medium">
                                <AlertTriangle className="w-3 h-3 flex-shrink-0" />{error}
                            </p>
                        )}
                        <div className="flex gap-2">
                            <Button
                                type="button"
                                onClick={handleSetup}
                                disabled={working || passphrase.length < 8 || passphrase !== passphraseConfirm}
                                className="flex-1 h-11 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 text-[10px] font-black uppercase tracking-wider gap-2 disabled:opacity-30"
                            >
                                {working ? (
                                    <>
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        Encrypting (this takes ~2s)…
                                    </>
                                ) : (
                                    <>
                                        <ShieldCheck className="w-3.5 h-3.5" />
                                        Save to Cloud
                                    </>
                                )}
                            </Button>
                            <Button
                                type="button"
                                onClick={handleCancel}
                                disabled={working}
                                className="h-11 px-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/30 hover:text-white/60 text-[10px] font-black uppercase tracking-wider"
                            >
                                Cancel
                            </Button>
                        </div>
                    </motion.div>
                )}

                {/* Recovery form */}
                {mode === "recover" && (
                    <motion.div
                        key="recover"
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        className="space-y-3"
                    >
                        <PassphraseInput
                            label="Recovery Passphrase"
                            value={passphrase}
                            onChange={(v) => { setPassphrase(v); setError(""); }}
                            show={showPassphrase}
                            onToggleShow={() => setShowPassphrase((s) => !s)}
                            placeholder="Enter your Recovery Passphrase"
                        />
                        {error && (
                            <p className="text-[10px] text-rose-400 flex items-center gap-1.5 font-medium">
                                <AlertTriangle className="w-3 h-3 flex-shrink-0" />{error}
                            </p>
                        )}
                        <div className="flex gap-2">
                            <Button
                                type="button"
                                onClick={handleRecover}
                                disabled={working || !passphrase}
                                className="flex-1 h-11 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 text-[10px] font-black uppercase tracking-wider gap-2 disabled:opacity-30"
                            >
                                {working ? (
                                    <>
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        Decrypting…
                                    </>
                                ) : (
                                    <>
                                        <Unlock className="w-3.5 h-3.5" />
                                        Recover Key
                                    </>
                                )}
                            </Button>
                            <Button
                                type="button"
                                onClick={handleCancel}
                                disabled={working}
                                className="h-11 px-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/30 hover:text-white/60 text-[10px] font-black uppercase tracking-wider"
                            >
                                Cancel
                            </Button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

// ─── Small sub-component ───────────────────────────────────────────────────────

interface PassphraseInputProps {
    label: string;
    value: string;
    onChange: (v: string) => void;
    show: boolean;
    onToggleShow: () => void;
    placeholder?: string;
    hint?: string;
    matchState?: "match" | "mismatch" | "neutral";
}

function PassphraseInput({
    label,
    value,
    onChange,
    show,
    onToggleShow,
    placeholder,
    hint,
    matchState = "neutral",
}: PassphraseInputProps) {
    return (
        <div className="space-y-1.5">
            <label className="text-[9px] font-black uppercase tracking-[0.2em] text-white/35 block">
                {label}
            </label>
            <div className="relative">
                <input
                    type={show ? "text" : "password"}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={placeholder}
                    className={cn(
                        "w-full bg-white/5 border rounded-xl px-4 py-3 pr-10 text-[12px] text-white placeholder-white/20 focus:outline-none focus:ring-1 transition-all font-medium",
                        matchState === "match"
                            ? "border-emerald-500/40 focus:ring-emerald-500/30"
                            : matchState === "mismatch"
                                ? "border-rose-500/40 focus:ring-rose-500/30"
                                : "border-white/10 focus:ring-white/20 focus:border-white/20"
                    )}
                    autoComplete="new-password"
                    spellCheck={false}
                />
                <button
                    type="button"
                    onClick={onToggleShow}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/60 transition-colors"
                >
                    {show ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
            </div>
            {hint && <p className="text-[9px] text-white/25 ml-1">{hint}</p>}
            {matchState !== "neutral" && (
                <p
                    className={cn(
                        "text-[9px] font-black uppercase tracking-wider ml-1",
                        matchState === "match" ? "text-emerald-400" : "text-rose-400"
                    )}
                >
                    {matchState === "match" ? "✓ Passphrases match" : "✕ Passphrases don't match"}
                </p>
            )}
        </div>
    );
}
