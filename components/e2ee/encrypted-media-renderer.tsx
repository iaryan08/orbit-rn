"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { decryptMediaBlob } from "@/lib/client/crypto-e2ee";
import { ShieldCheck, Loader2, AlertTriangle, PlayCircle } from "lucide-react";

interface EncryptedMediaRendererProps {
    src: string;
    alt?: string;
    className?: string;
    type?: "image" | "video";
    encryptedStatus: boolean;
}

/**
 * Parses the base64 IV from an orbit media URL params if present.
 * URL Example: /api/media/view?bucket=memories&path=123/abc.webp&iv=XYZ
 */
function extractIvFromUrl(url: string): string | null {
    try {
        const urlObj = new URL(url, window.location.origin);
        return urlObj.searchParams.get("iv");
    } catch {
        return null;
    }
}

export function EncryptedMediaRenderer({ src, alt = "Encrypted Media", className, type = "image", encryptedStatus }: EncryptedMediaRendererProps) {
    const [decryptedUrl, setDecryptedUrl] = useState<string | null>(null);
    const [isDecrypting, setIsDecrypting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const decryptAndLoad = useCallback(async () => {
        if (!encryptedStatus) {
            setDecryptedUrl(src); // Pass through plaintext immediately
            return;
        }

        const iv = extractIvFromUrl(src);
        if (!iv) {
            setError("Missing IV");
            return;
        }

        setIsDecrypting(true);
        setError(null);

        try {
            // 1. Fetch the raw encrypted blob directly from the edge/CDN (bypass proxy decryption)
            const response = await fetch(src);
            if (!response.ok) throw new Error("Failed to fetch media");
            const blob = await response.blob();

            // Extract fileId from the src URL path (e.g. "bucket/path/to/file.webp")
            let fileId = "";
            try {
                const urlObj = new URL(src, window.location.origin);
                fileId = urlObj.pathname.replace(/^\/+/g, ""); // Strip leading slashes
            } catch {
                fileId = src; // Fallback to raw string if not a pure URL
            }

            // 2. Decrypt entirely in the browser using the derived HKDF key
            const decryptedBlob = await decryptMediaBlob(blob, fileId, iv, type === "video" ? "video/mp4" : "image/webp");

            // 3. Create an ephemeral object URL for the DOM
            const objectUrl = URL.createObjectURL(decryptedBlob);
            setDecryptedUrl(objectUrl);

        } catch (err: any) {
            console.error("[E2EE Renderer] Failed:", err);
            setError("Decryption Failed");
        } finally {
            setIsDecrypting(false);
        }
    }, [src, encryptedStatus, type]);

    useEffect(() => {
        decryptAndLoad();

        // Cleanup the object URL when unmounted or url changes
        return () => {
            if (decryptedUrl && decryptedUrl.startsWith("blob:")) {
                URL.revokeObjectURL(decryptedUrl);
            }
        };
    }, [decryptAndLoad]);

    if (error) {
        return (
            <div className={`flex flex-col items-center justify-center bg-black/40 border border-red-500/20 rounded-xl p-4 ${className}`}>
                <AlertTriangle className="h-6 w-6 text-red-400 mb-2" />
                <span className="text-xs font-medium text-red-200">{error}</span>
            </div>
        );
    }

    if (!decryptedUrl || isDecrypting) {
        return (
            <div className={`flex flex-col items-center justify-center bg-black/20 rounded-xl backdrop-blur-sm ${className}`}>
                <div className="relative">
                    <Loader2 className="h-6 w-6 text-white/50 animate-spin" />
                    {encryptedStatus && (
                        <ShieldCheck className="h-3 w-3 text-emerald-400 absolute -bottom-1 -right-1" />
                    )}
                </div>
            </div>
        );
    }

    if (type === "video") {
        return (
            <div className={`relative ${className}`}>
                <video
                    src={decryptedUrl}
                    className="w-full h-full object-cover"
                    controls
                    playsInline
                    preload="metadata"
                />
            </div>
        );
    }

    return (
        <div className={`relative ${className}`}>
            <Image
                src={decryptedUrl}
                alt={alt}
                fill
                sizes="(max-width: 768px) 100vw, 50vw"
                className="object-cover"
                unoptimized={decryptedUrl.startsWith("blob:")}
            />
        </div>
    );
}
