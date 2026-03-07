"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useAuth } from '@/components/auth-provider';
// import { createClient } from "@/lib/supabase/client"; // FIREBASE
import { useOrbitStore } from '@/lib/store/global-store';
import { format } from "date-fns";
import { useSearchParams } from "next/navigation";

import { useAppMode } from "@/components/app-mode-context";
import { markAsViewed } from "@/lib/client/auth";
import { Capacitor } from '@capacitor/core';
import {
    MessageSquareHeart,
    HandHeart,
    Heart,
    Flame,
    Moon as MoonIcon,
    Gift,
    Camera,
    Infinity as InfinityIcon,
    CloudMoon,
    Home,
    Film,
    HeartPulse,
    Waves,
    CalendarIcon,
    Unlock,
    Sparkles,
    BedDouble
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { MilestoneCard } from "@/components/intimacy/milestone-card";
import { logIntimacyMilestone } from "@/lib/client/intimacy";
import { cn } from "@/lib/utils";
import { useBackHandler } from "@/components/global-back-handler";
import { SoftPageLoader } from "@/components/soft-page-loader";
import { SectionHeader } from "@/components/section-header";

const questions = [
    {
        id: "first_talk",
        label: "First Talk",
        q: "When was the first talk?",
        icon: <MessageSquareHeart className="w-5 h-5" />,
        image: "/images/intimacy/first_talk.webp"
    },
    {
        id: "first_hug",
        label: "First Hug",
        q: "First meaningful hug?",
        icon: <HandHeart className="w-5 h-5" />,
        image: "/images/intimacy/first_hug_icon.webp"
    },
    {
        id: "first_kiss",
        label: "First Kiss",
        q: "How did the first kiss begin?",
        icon: <Heart className="w-5 h-5" />,
        image: "/images/intimacy/first_kiss.webp"
    },
    {
        id: "first_french_kiss",
        label: "First French Kiss",
        q: "First deep kiss?",
        icon: <Flame className="w-5 h-5" />,
        image: "/images/intimacy/first_kiss_icon.webp"
    },
    {
        id: "first_sex",
        label: "First Sex",
        q: "First encounter?",
        icon: <BedDouble className="w-5 h-5" />,
        image: "/images/intimacy/first_sex_icon.webp"
    },
    {
        id: "first_oral",
        label: "First Oral Sex",
        q: "When was this shared?",
        icon: <Waves className="w-5 h-5" />,
        image: "/images/intimacy/first_oral.webp"
    },
    {
        id: "first_time_together",
        label: "First Bedtime Together",
        q: "First night together?",
        icon: <MoonIcon className="w-5 h-5" />,
        image: "/images/intimacy/together.webp"
    },
    {
        id: "first_surprise",
        label: "First Surprise",
        q: "First intimate surprise?",
        icon: <Gift className="w-5 h-5" />,
        image: "/images/intimacy/first_surprise.webp"
    },
    {
        id: "first_memory",
        label: "First Memory",
        q: "A favorite early memory?",
        icon: <Camera className="w-5 h-5" />,
        image: "/images/intimacy/first_memory.webp"
    },
    {
        id: "first_confession",
        label: "First Confession",
        q: "What was the first secret?",
        icon: <Unlock className="w-5 h-5" />,
        image: "/images/intimacy/confession.webp"
    },
    {
        id: "first_promise",
        label: "First Promise",
        q: "First meaningful promise?",
        icon: <InfinityIcon className="w-5 h-5" />,
        image: "/images/intimacy/first_promise.webp"
    },
    {
        id: "first_night_together",
        label: "First Night Apart",
        q: "How was the first night apart?",
        icon: <CloudMoon className="w-5 h-5" />,
        image: "/images/intimacy/first_night_apart.webp"
    },
    {
        id: "first_time_alone",
        label: "First Time Alone",
        q: "First private evening with {{partner}}?",
        icon: <Home className="w-5 h-5" />
    },
    {
        id: "first_movie_date",
        label: "First Movie Date",
        q: "First movie date with {{partner}}?",
        icon: <Film className="w-5 h-5" />
    },
    {
        id: "first_intimate_moment",
        label: "First Intimate Moment",
        q: "First romantic expression to {{partner}}?",
        icon: <HeartPulse className="w-5 h-5" />
    },
];

export default function IntimacyPage() {
    return (
        <Suspense fallback={<SoftPageLoader className="pt-24 pb-12" />}>
            <IntimacyContent />
        </Suspense>
    );
}

function IntimacyContent() {
    const { user } = useAuth();
    const { mode } = useAppMode();
    const { isInitialized, profile, partnerProfile, couple, milestones } = useOrbitStore();
    const coupleId = profile?.couple_id;
    const user1Id = couple?.user1_id;

    const [activeQuestion, setActiveQuestion] = useState<string | null>(null);
    const [seenMilestones, setSeenMilestones] = useState<Set<string>>(new Set());

    const searchParams = useSearchParams();
    const qParam = searchParams.get('q');

    useEffect(() => {
        if (qParam) {
            setActiveQuestion(qParam);
            setSeenMilestones(prev => {
                const n = new Set(prev);
                n.add(qParam);
                return n;
            });
            setTimeout(() => {
                const el = document.getElementById(qParam);
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 600);
        }
    }, [qParam]);

    // const supabase = createClient(); // FIREBASE
    const { toast } = useToast();
    const isNative = Capacitor.isNativePlatform();

    const isUser1 = user && user1Id && user.uid === user1Id; // FIREBASE uses uid
    const myContentField = isUser1 ? "content_user1" : "content_user2";
    const partnerContentField = isUser1 ? "content_user2" : "content_user1";
    const myDateField = isUser1 ? "date_user1" : "date_user2";
    const partnerDateField = isUser1 ? "date_user2" : "date_user1";

    const handleSave = async (category: string, date: Date | undefined, time: string | undefined, myContent: string) => {
        const payload = {
            category,
            content: myContent,
            date: date && !isNaN(date.getTime()) ? format(date, "yyyy-MM-dd") : undefined,
            time: time || undefined
        }

        const res = await logIntimacyMilestone(payload)

        if (res.error) {
            const isOfflineErr = res.error.toLowerCase().includes('fetch') || res.error.toLowerCase().includes('network');
            toast({
                title: isOfflineErr ? "Connect to internet to save" : "Failed to save memory",
                variant: isOfflineErr ? "default" : "destructive"
            });
        } else {
            // Optimistically update store
            useOrbitStore.getState().upsertMilestone({
                couple_id: coupleId,
                category: payload.category,
                [myContentField]: payload.content,
                ...(payload.date && {
                    milestone_date: payload.date,
                    ...(['first_kiss', 'first_surprise', 'first_memory'].includes(payload.category) ? { [myDateField]: payload.date } : {})
                }),
                ...(payload.time && {
                    milestone_time: payload.time,
                    ...(['first_kiss', 'first_surprise', 'first_memory'].includes(payload.category) ? { [isUser1 ? "time_user1" : "time_user2"]: payload.time } : {})
                }),
                ...milestones[category] // Keep existing data
            })

            if (res.queued) {
                toast({ title: "Saved offline — will sync later", variant: "default" });
            }
            setActiveQuestion(null);
        }
    };

    const handleToggle = (id: string) => {
        const isOpening = activeQuestion !== id;
        setActiveQuestion(isOpening ? id : null);

        if (isOpening) {
            setSeenMilestones(prev => {
                const next = new Set(prev);
                next.add(id);
                return next;
            });
            // Check if there is unread partner content
            const milestone = milestones[id];
            const hasPartnerContent = milestone?.[partnerContentField];
            const hasMyContent = milestone?.[myContentField];

            if (hasPartnerContent && !hasMyContent) {
                // Clear the global indicator once seen
                // Note: Intimacy counts usually roll into general notificationsCount or specific field
                void markAsViewed('intimacy');
            }
        }
    }

    if (!isInitialized) {
        return <SoftPageLoader className="pt-24 pb-12" />;
    }

    return (
        <div
            className={cn(
                "max-w-7xl mx-auto space-y-6 md:space-y-12 pt-24 md:pt-12 pb-32 md:pb-12",
                isNative ? "pt-16" : ""
            )}
        >
            <SectionHeader
                title="Intimacy"
                label="Deep Connection"
                count={questions.length}
                suffix="prompts"
            />

            <div className="grid gap-0 md:gap-8">
                {questions.map((q, idx) => (
                    <div key={q.id} id={q.id}>
                        <MilestoneCard
                            id={q.id}
                            label={q.label}
                            question={q.q.replace("{{partner}}", partnerProfile?.display_name || "your partner")}
                            partnerName={partnerProfile?.display_name || "Partner"}
                            icon={q.icon}
                            image={q.image}
                            milestone={milestones[q.id]}
                            myContentField={myContentField}
                            partnerContentField={partnerContentField}
                            myDateField={myDateField}
                            partnerDateField={partnerDateField}
                            isOpen={activeQuestion === q.id}
                            onToggle={() => handleToggle(q.id)}
                            onSave={handleSave}
                            isLocallyViewed={seenMilestones.has(q.id)}
                        />
                    </div>
                ))}
            </div>
            {activeQuestion && (
                <IntimacyBackHandler activeQuestion={activeQuestion} onClose={() => setActiveQuestion(null)} />
            )}
        </div>
    );
}

function IntimacyBackHandler({ activeQuestion, onClose }: { activeQuestion: string | null; onClose: () => void }) {
    useBackHandler(() => {
        if (activeQuestion) {
            onClose();
            return true;
        }
        return false;
    }, !!activeQuestion);
    return null;
}
