import { cn } from "@/lib/utils";

interface SectionMetaProps {
    label: string;
    count?: number;
    suffix?: string;
    className?: string;
}

export function SectionMeta({ label, count, suffix = "items", className }: SectionMetaProps) {
    return (
        <div className={cn("inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1", className)}>
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-white/70">{label}</span>
            {typeof count === "number" && (
                <span className="text-[11px] font-semibold text-white/55">
                    {count} {suffix}
                </span>
            )}
        </div>
    );
}
