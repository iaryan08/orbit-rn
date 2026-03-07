"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    ShieldCheck,
    ShieldOff,
    Download,
    Upload,
    Eye,
    EyeOff,
    Copy,
    Check,
    ChevronDown,
    Lock,
    Key,
    AlertTriangle,
    Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
    createRecoveryKitBlob,
    importRecoveryKit,
    hasStoredMediaPassphrase,
    getStoredMediaKey,
    setStoredMediaPassphrase,
} from "@/lib/client/crypto-e2ee";
import { cn } from "@/lib/utils";
import { PassphraseEscrowPanel } from "@/components/e2ee/passphrase-escrow-panel";

type KeyStatus = "active" | "missing" | "checking";

export function PrivacyKeyPanel() {
    const [keyStatus, setKeyStatus] = useState<KeyStatus>("checking");
    const [showKey, setShowKey] = useState(false);
    const [rawKey, setRawKey] = useState<string>("");
    const [copied, setCopied] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [showManualEntry, setShowManualEntry] = useState(false);
    const [showExplainer, setShowExplainer] = useState(false);
    const [manualKey, setManualKey] = useState("");
    const [manualKeyError, setManualKeyError] = useState("");
    const importRef = useRef<HTMLInputElement>(null);
    const { toast } = useToast();

    useEffect(() => {
        const key = getStoredMediaKey();
        if (hasStoredMediaPassphrase()) {
            setKeyStatus("active");
            setRawKey(key);
        } else {
            setKeyStatus("missing");
        }
    }, []);

    const handleExport = async () => {
        setExporting(true);
        try {
            const blob = createRecoveryKitBlob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            const dateStr = new Date().toISOString().slice(0, 10);
            a.download = `orbit-privacy-recovery-kit-${dateStr}.json`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
            toast({ title: "Recovery Kit downloaded ✓", variant: "success" });
        } catch (e: any) {
            toast({ title: e?.message || "Could not export recovery kit", variant: "destructive" });
        } finally {
            setExporting(false);
        }
    };

    const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            await importRecoveryKit(file);
            const newKey = getStoredMediaKey();
            setRawKey(newKey);
            setKeyStatus("active");
            toast({ title: "Privacy Key Restored ✓", variant: "success" });
        } catch (err: any) {
            toast({ title: err?.message || "Invalid recovery kit file", variant: "destructive" });
        } finally {
            e.target.value = "";
        }
    };

    const handleManualKeyImport = () => {
        setManualKeyError("");
        const trimmed = manualKey.trim().replace(/\s+/g, "");
        if (!trimmed) {
            setManualKeyError("Please enter your privacy key.");
            return;
        }
        try {
            setStoredMediaPassphrase(trimmed);
            if (!hasStoredMediaPassphrase()) {
                setManualKeyError("Invalid key format. Keys must be 43 Base64Url characters.");
                return;
            }
            const newKey = getStoredMediaKey();
            setRawKey(newKey);
            setKeyStatus("active");
            setManualKey("");
            setShowManualEntry(false);
            toast({ title: "Privacy Key Saved ✓", variant: "success" });
        } catch {
            setManualKeyError("Invalid key format.");
        }
    };

    const handleCopyKey = async () => {
        if (!rawKey) return;
        await navigator.clipboard.writeText(rawKey);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const maskedKey = rawKey
        ? rawKey.slice(0, 6) + "••••••••••••••••••••••••••••••••" + rawKey.slice(-4)
        : "";

    return (
        <div className="space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-sm font-black uppercase tracking-[0.25em] text-white/70">
                        Privacy Key
                    </h3>
                    <p className="text-[10px] text-white/30 mt-0.5 tracking-wider uppercase">
                        End-to-end encryption
                    </p>
                </div>
                <button
                    onClick={() => setShowExplainer((v) => !v)}
                    className="flex items-center gap-1 text-white/30 hover:text-white/60 transition-colors text-[10px] uppercase tracking-wider font-bold"
                >
                    <Info className="w-3 h-3" />
                    What is this?
                </button>
            </div>

            {/* Explainer accordion */}
            <AnimatePresence>
                {showExplainer && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                    >
                        <div className="bg-white/[0.03] border border-white/8 rounded-2xl p-4 space-y-3 text-left">
                            <p className="text-[11px] text-white/50 leading-relaxed">
                                <span className="text-white/80 font-semibold">Your memories are encrypted</span> using a unique 256-bit key stored only on your device. No server, no cloud, no one else can read them.
                            </p>
                            <p className="text-[11px] text-white/50 leading-relaxed">
                                <span className="text-rose-400 font-semibold">If you lose this key</span> (uninstall, new device), your encrypted memories will be locked forever — unless you have a Recovery Kit or Cloud Recovery set up.
                            </p>
                            <p className="text-[11px] text-white/50 leading-relaxed">
                                <span className="text-emerald-400 font-semibold">Two recovery options:</span> Download a Recovery Kit file, OR set up Cloud Recovery with a passphrase — the safest option since we store an encrypted copy on our server.
                            </p>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Status Card */}
            <div
                className={cn(
                    "relative rounded-2xl border overflow-hidden p-5 transition-all",
                    keyStatus === "active"
                        ? "bg-emerald-500/5 border-emerald-500/20"
                        : keyStatus === "missing"
                            ? "bg-rose-500/5 border-rose-500/20"
                            : "bg-white/[0.02] border-white/5"
                )}
            >
                <div
                    className={cn(
                        "absolute -top-8 -right-8 w-32 h-32 rounded-full blur-3xl pointer-events-none",
                        keyStatus === "active" ? "bg-emerald-500/10" : "bg-rose-500/10"
                    )}
                />
                <div className="flex items-center gap-4 relative">
                    <div
                        className={cn(
                            "w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0",
                            keyStatus === "active"
                                ? "bg-emerald-500/15 ring-1 ring-emerald-500/30"
                                : "bg-rose-500/15 ring-1 ring-rose-500/30"
                        )}
                    >
                        {keyStatus === "active" ? (
                            <ShieldCheck className="w-6 h-6 text-emerald-400" />
                        ) : keyStatus === "missing" ? (
                            <ShieldOff className="w-6 h-6 text-rose-400" />
                        ) : (
                            <Key className="w-6 h-6 text-white/30 animate-pulse" />
                        )}
                    </div>
                    <div className="flex-1 min-w-0">
                        <p
                            className={cn(
                                "text-sm font-bold",
                                keyStatus === "active" ? "text-emerald-300" : keyStatus === "missing" ? "text-rose-300" : "text-white/40"
                            )}
                        >
                            {keyStatus === "active" ? "Key Active" : keyStatus === "missing" ? "No Key Found" : "Checking…"}
                        </p>
                        <p className="text-[10px] text-white/30 mt-0.5 leading-relaxed">
                            {keyStatus === "active"
                                ? "Your encrypted memories are accessible on this device."
                                : keyStatus === "missing"
                                    ? "Import a Recovery Kit or use Cloud Recovery to restore your key."
                                    : "Looking for your local encryption key…"}
                        </p>
                    </div>
                </div>

                {/* Raw Key Display (active only) */}
                <AnimatePresence>
                    {keyStatus === "active" && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            className="overflow-hidden"
                        >
                            <div className="mt-4 pt-4 border-t border-white/5">
                                <p className="text-[9px] text-white/25 uppercase tracking-[0.2em] font-bold mb-2">
                                    Key Fingerprint
                                </p>
                                <div className="flex items-center gap-2 bg-black/30 rounded-xl px-3 py-2.5">
                                    <Lock className="w-3 h-3 text-white/20 flex-shrink-0" />
                                    <code className="flex-1 text-[10px] font-mono text-white/40 truncate select-all">
                                        {showKey ? rawKey : maskedKey}
                                    </code>
                                    <div className="flex items-center gap-1 flex-shrink-0">
                                        <button
                                            onClick={() => setShowKey((v) => !v)}
                                            className="p-1 hover:text-white/60 text-white/25 transition-colors"
                                            title={showKey ? "Hide key" : "Show key"}
                                        >
                                            {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                        </button>
                                        <button
                                            onClick={handleCopyKey}
                                            className="p-1 hover:text-emerald-400 text-white/25 transition-colors"
                                            title="Copy key"
                                        >
                                            {copied ? (
                                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                                            ) : (
                                                <Copy className="w-3.5 h-3.5" />
                                            )}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* ── Recovery Option 1: Recovery Kit File ── */}
            <div>
                <p className="text-[9px] uppercase tracking-[0.25em] font-black text-white/25 mb-2">
                    Option 1 — Recovery Kit File
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {keyStatus === "active" && (
                        <Button
                            type="button"
                            onClick={handleExport}
                            disabled={exporting}
                            className="h-12 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/50 hover:text-white/80 text-[10px] font-black uppercase tracking-[0.2em] gap-2 transition-all"
                        >
                            <Download className="w-3.5 h-3.5" />
                            {exporting ? "Downloading…" : "Download Kit"}
                        </Button>
                    )}
                    <Button
                        type="button"
                        onClick={() => importRef.current?.click()}
                        className={cn(
                            "h-12 rounded-2xl border text-[10px] font-black uppercase tracking-[0.2em] gap-2 transition-all",
                            keyStatus === "active"
                                ? "bg-white/5 hover:bg-white/10 border-white/10 text-white/50 hover:text-white/80"
                                : "bg-rose-500/10 hover:bg-rose-500/20 border-rose-500/25 text-rose-300"
                        )}
                    >
                        <Upload className="w-3.5 h-3.5" />
                        Import Kit
                    </Button>
                    <input
                        ref={importRef}
                        type="file"
                        accept=".json,application/json"
                        className="hidden"
                        onChange={handleImportFile}
                    />
                </div>
            </div>

            {/* Manual Key Entry */}
            <div>
                <button
                    onClick={() => setShowManualEntry((v) => !v)}
                    className="flex items-center gap-2 text-white/25 hover:text-white/50 transition-colors text-[9px] uppercase tracking-[0.15em] font-black w-full py-1"
                >
                    <Key className="w-3 h-3" />
                    Enter key manually
                    <ChevronDown
                        className={cn(
                            "w-3 h-3 ml-auto transition-transform",
                            showManualEntry ? "rotate-180" : ""
                        )}
                    />
                </button>
                <AnimatePresence>
                    {showManualEntry && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            className="overflow-hidden"
                        >
                            <div className="pt-3 space-y-2">
                                <p className="text-[10px] text-white/30 leading-relaxed">
                                    Paste your raw Base64Url encryption key. Find it by opening your Recovery Kit JSON and copying the{" "}
                                    <code className="px-1 bg-white/5 rounded font-mono">mediaKey</code> value.
                                </p>
                                <div className="relative">
                                    <input
                                        type="text"
                                        value={manualKey}
                                        onChange={(e) => {
                                            setManualKey(e.target.value);
                                            setManualKeyError("");
                                        }}
                                        placeholder="Paste your Base64Url key here…"
                                        className={cn(
                                            "w-full bg-white/5 border rounded-xl px-4 py-3 text-[11px] font-mono text-white/70 placeholder-white/20 focus:outline-none focus:ring-1 transition-all",
                                            manualKeyError
                                                ? "border-rose-500/50 focus:ring-rose-500/50"
                                                : "border-white/10 focus:ring-white/20 focus:border-white/20"
                                        )}
                                    />
                                </div>
                                {manualKeyError && (
                                    <p className="text-[10px] text-rose-400 flex items-center gap-1">
                                        <AlertTriangle className="w-3 h-3" />
                                        {manualKeyError}
                                    </p>
                                )}
                                <Button
                                    type="button"
                                    onClick={handleManualKeyImport}
                                    disabled={!manualKey.trim()}
                                    className="w-full h-10 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/60 hover:text-white text-[10px] font-black uppercase tracking-wider transition-all disabled:opacity-30"
                                >
                                    Save Key
                                </Button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* ── Recovery Option 2: Passphrase Cloud Escrow ── */}
            <div>
                <div className="flex items-center gap-3 mb-3">
                    <div className="flex-1 border-t border-white/5" />
                    <p className="text-[9px] uppercase tracking-[0.25em] font-black text-white/20">
                        Option 2 — Cloud Recovery
                    </p>
                    <div className="flex-1 border-t border-white/5" />
                </div>
                <div className="bg-white/[0.015] border border-white/5 rounded-2xl p-4">
                    <PassphraseEscrowPanel />
                </div>
            </div>

            {/* Warning banner: missing key */}
            <AnimatePresence>
                {keyStatus === "missing" && (
                    <motion.div
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 4 }}
                        className="flex items-start gap-3 bg-amber-500/5 border border-amber-500/15 rounded-2xl p-4"
                    >
                        <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                        <div>
                            <p className="text-[11px] text-amber-300 font-semibold mb-1">Encrypted memories are hidden</p>
                            <p className="text-[10px] text-white/35 leading-relaxed">
                                Content encrypted by your partner will not be visible until you restore the matching key. Use one of the two options above.
                            </p>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
