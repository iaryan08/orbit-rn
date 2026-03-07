"use client";

import { Lock, Shield, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface EncryptedLockedCardProps {
    className?: string;
    onClick?: (e: React.MouseEvent) => void;
    label?: string;
    subtext?: React.ReactNode;
    icon?: 'lock' | 'alert';
}

export function EncryptedLockedCard({ className, onClick, label = "Encrypted Content", subtext = "END-TO-END ENCRYPTED", icon = 'lock' }: EncryptedLockedCardProps) {
    return (
        <div
            onClick={onClick}
            className={cn(
                "relative flex flex-col items-center justify-center p-6 cursor-pointer overflow-hidden transition-all duration-300",
                "bg-[linear-gradient(135deg,rgba(20,20,25,0.95),rgba(10,10,15,0.98))]",
                "border border-white/5 hover:border-white/15",
                "shadow-[inset_0_0_20px_rgba(255,255,255,0.02)]",
                "group",
                className
            )}
        >
            {/* Subtle animated background grid or noise could go here, but keeping it sleek */}
            <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:14px_14px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)] opacity-30 group-hover:opacity-50 transition-opacity duration-700" />

            <div className="relative z-10 flex flex-col items-center gap-4 text-center">
                <div className="relative flex items-center justify-center w-14 h-14 rounded-full bg-black/40 border border-white/10 shadow-lg group-hover:scale-110 transition-transform duration-500 ease-out">
                    <Shield className="absolute inset-0 w-full h-full text-white/5 opacity-50 blur-[2px]" />
                    {icon === 'alert' ? (
                        <AlertTriangle className="w-5 h-5 text-amber-500/80 drop-shadow-[0_0_8px_rgba(245,158,11,0.3)] transition-colors group-hover:text-amber-400" />
                    ) : (
                        <Lock className="w-5 h-5 text-white/60 drop-shadow-[0_0_8px_rgba(255,255,255,0.3)] transition-colors group-hover:text-white" />
                    )}
                </div>

                <div className="space-y-1.5 px-4 w-full">
                    <p className="text-[13px] font-serif tracking-wide text-white/80 group-hover:text-white transition-colors break-words text-balance">
                        {label}
                    </p>
                    <p className="text-[9px] uppercase tracking-[0.25em] font-black text-white/30 group-hover:text-white/50 transition-colors break-words text-balance">
                        {subtext}
                    </p>
                </div>
            </div>

            {/* Corner glowing effect */}
            <div className="absolute -bottom-12 -right-12 w-32 h-32 bg-white/5 blur-3xl rounded-full opacity-50 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
            <div className="absolute -top-12 -left-12 w-32 h-32 bg-white/5 blur-3xl rounded-full opacity-50 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
        </div>
    );
}
