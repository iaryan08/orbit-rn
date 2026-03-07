"use client";

import { useEffect, useState } from "react";
import { decryptText, hasStoredMediaPassphrase } from "@/lib/client/crypto-e2ee";
import { Lock, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface DecryptedTextProps {
    ciphertext?: string | null;
    iv?: string | null;
    id?: string | null;
    fallback?: React.ReactNode;
    className?: string;
    onNeedRestore?: () => void;
}

export function DecryptedText({ ciphertext, iv, id, fallback, className, onNeedRestore }: DecryptedTextProps) {
    const [status, setStatus] = useState<'loading' | 'success' | 'locked' | 'error'>('loading');
    const [content, setContent] = useState<string>('');

    useEffect(() => {
        let isMounted = true;

        async function attemptDecryption() {
            if (!ciphertext || !iv) {
                if (fallback) {
                    if (isMounted) setStatus('success');
                    // We don't set string content if it's a generic React node fallback
                } else {
                    if (isMounted) setStatus('error');
                }
                return;
            }

            if (!hasStoredMediaPassphrase()) {
                if (isMounted) setStatus('locked');
                return;
            }

            try {
                const plaintext = await decryptText(id || ciphertext, ciphertext, iv);
                if (isMounted) {
                    setContent(plaintext);
                    setStatus('success');
                }
            } catch (err) {
                console.error("[DecryptedText] failed to decrypt:", err);
                if (isMounted) setStatus('error');
            }
        }

        attemptDecryption();

        return () => {
            isMounted = false;
        };
    }, [ciphertext, iv, fallback]);

    if (status === 'loading') {
        return (
            <div className={cn("flex items-center gap-2 text-white/40 animate-pulse", className)}>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm italic font-serif">Decrypting...</span>
            </div>
        );
    }

    if (status === 'locked' || status === 'error') {
        return (
            <div
                className={cn(
                    "flex flex-col items-center justify-center gap-3 text-center p-6 rounded-2xl border border-rose-500/30 bg-[linear-gradient(165deg,rgba(54,8,20,0.96),rgba(16,3,9,0.98))]",
                    className
                )}
            >
                <div className="w-12 h-12 rounded-full bg-rose-500/20 border border-rose-400/35 flex items-center justify-center">
                    <Lock className="w-5 h-5 text-rose-300" />
                </div>
                <div className="space-y-2">
                    <p className="text-rose-100 font-serif font-bold text-md">Encrypted Letter</p>
                    <p className="text-white/75 text-sm italic">
                        {status === 'locked' ? 'Privacy Key is required to read this message.' : 'Decryption failed. The key or data might be invalid.'}
                    </p>
                </div>
                {onNeedRestore && (
                    <Button
                        variant="ghost"
                        size="sm"
                        className="mt-1 text-rose-200/90 hover:text-rose-100 hover:bg-rose-500/20"
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onNeedRestore();
                        }}
                    >
                        Restore Key
                    </Button>
                )}
            </div>
        );
    }

    if (!ciphertext || !iv) {
        return <>{fallback}</>;
    }

    return (
        <span className={cn("whitespace-pre-wrap", className)}>
            {content}
        </span>
    );
}
