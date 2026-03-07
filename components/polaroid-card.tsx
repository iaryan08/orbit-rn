"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Camera, Download, Share2, Trash2, Maximize2, Key } from "lucide-react";
import { Button } from "@/components/ui/button";
import { hasStoredMediaPassphrase, isEncryptedMediaUrl } from "@/lib/client/crypto-e2ee";
import { DecryptedImage } from "./e2ee/decrypted-image";
const FullScreenImageModal = dynamic(() => import("./full-screen-image-modal").then(m => ({ default: m.FullScreenImageModal })), { ssr: false });

interface PolaroidCardProps {
    imageUrl: string;
    caption?: string;
    createdAt: string;
    onDelete?: () => void;
    isDeveloping?: boolean;
}

export function PolaroidCard({ imageUrl, caption, createdAt, onDelete, isDeveloping = false }: PolaroidCardProps) {
    const [developed, setDeveloped] = useState(!isDeveloping);
    const [fullScreenImage, setFullScreenImage] = useState<string | null>(null);

    useEffect(() => {
        if (isDeveloping) {
            const timer = setTimeout(() => setDeveloped(true), 1500); // Quick initial fade
            return () => clearTimeout(timer);
        }
    }, [isDeveloping]);

    const isEncrypted = isEncryptedMediaUrl(imageUrl);
    const hasKey = hasStoredMediaPassphrase();
    const canView = !isEncrypted || hasKey;

    return (
        <div className="relative group perspective-1000">
            {/* Polaroid Frame */}
            <div
                className={`bg-white p-3 pb-10 shadow-2xl transition-[transform,opacity] duration-700 ease-out 
          ${developed ? 'rotate-[-1deg] translate-y-0 opacity-100' : 'rotate-[2deg] translate-y-4 scale-95 opacity-0'}
        `}
                style={{
                    boxShadow: '0 20px 50px rgba(0,0,0,0.5), inset 0 0 10px rgba(0,0,0,0.05)'
                }}
            >
                <div
                    className="relative aspect-square bg-[#1a1a1a] overflow-hidden rounded-sm cursor-pointer group/img"
                    onClick={(e) => {
                        if (!canView) return;
                        e.stopPropagation();
                        setFullScreenImage(imageUrl);
                    }}
                >
                    {canView ? (
                        <DecryptedImage
                            src={imageUrl}
                            alt="Polaroid Memory"
                            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                            className={`object-cover transition-[transform,filter,opacity] duration-700 ease-out group-hover/img:scale-105
                  ${developed ? 'filter-none grayscale-0 opacity-100' : 'blur-xl grayscale opacity-20'}
                `}
                            isEncrypted={isEncrypted}
                        />
                    ) : (
                        <div className="absolute inset-0 bg-neutral-900 flex items-center justify-center">
                            {/* No Image Request made here */}
                        </div>
                    )}

                    {/* Locked/No Key UI */}
                    {developed && isEncrypted && !hasKey && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-500">
                            <Key className="w-8 h-8 text-white/40 mb-2" />
                            <p className="text-[10px] font-bold text-white/50 uppercase tracking-widest leading-tight">
                                Sorry, you need a key<br />to see this
                            </p>
                        </div>
                    )}

                    <div className="absolute inset-0 bg-black/20 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center">
                        <div className="bg-black/60 p-2 rounded-full shadow-2xl">
                            <Maximize2 className="w-4 h-4 text-white" />
                        </div>
                    </div>

                    {/* Subtle Flash Overlay */}
                    {!developed && (
                        <div className="absolute inset-0 bg-white/10 animate-pulse pointer-events-none" />
                    )}
                </div>

                {/* Caption/Time Slot */}
                <div className="mt-4 px-1">
                    <p className="font-pinyon text-lg text-gray-800 leading-none">
                        {caption || "A moment shared..."}
                    </p>
                    <p className="text-[10px] text-gray-400 font-sans uppercase tracking-widest mt-1">
                        {formatDistanceToNow(new Date(createdAt))} ago
                    </p>
                </div>
            </div>

            {/* Action Overlay (Visible on Hover) */}
            <div className="absolute top-2 right-2 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                {onDelete && (
                    <Button
                        variant="destructive"
                        size="icon"
                        className="w-8 h-8 rounded-full bg-white/20 backdrop-blur-md hover:bg-rose-500"
                        onClick={onDelete}
                    >
                        <Trash2 className="w-4 h-4" />
                    </Button>
                )}
            </div>

            {/* Full Screen Image Viewer */}
            <FullScreenImageModal
                src={fullScreenImage}
                images={fullScreenImage ? [fullScreenImage] : []}
                currentIndex={0}
                onClose={() => setFullScreenImage(null)}
            />
        </div>
    );
}
