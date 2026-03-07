"use client";

import { m, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, Quote, Heart, Flame } from "lucide-react";
import { cn } from "@/lib/utils";
import { Capacitor } from "@capacitor/core";
import { dedupedFetch } from "@/lib/dedup-fetch";
import { useOrbitStore } from "@/lib/store/global-store";

interface DailyContentData {
  quote: string;
  challenge: string;
  tip: string;
}

const FALLBACK_VARIANTS: DailyContentData[] = [
  {
    quote: "Small moments of care build a love that feels unshakable.",
    challenge: "Share one thing your partner did recently that made you feel deeply loved.",
    tip: "Use specific appreciation instead of generic praise to strengthen emotional safety.",
  },
  {
    quote: "Real intimacy grows when both hearts feel heard, not hurried.",
    challenge: "Sit together for five minutes and listen without interrupting.",
    tip: "Repeat your partner's point in your own words before replying.",
  },
  {
    quote: "Love matures when tenderness appears in ordinary routines.",
    challenge: "Do one small task today that quietly makes your partner's day easier.",
    tip: "Consistency beats intensity in long-term connection.",
  },
];
const API_TIMEOUT_MS = 5000;
const WEB_REFRESH_THROTTLE_MS = 10 * 60 * 1000;
const NATIVE_REFRESH_THROTTLE_MS = 30 * 60 * 1000;
const WEB_FAILED_REFRESH_RETRY_MS = 60 * 1000;
const NATIVE_FAILED_REFRESH_RETRY_MS = 5 * 60 * 1000;
const NATIVE_API_REFRESH_MAX_STALE_MS = 6 * 60 * 60 * 1000;
const LAST_SYNC_KEY_PREFIX = "dailyContentLastSyncTs";
const LAST_ATTEMPT_KEY_PREFIX = "dailyContentLastAttemptTs";

function getDailyFallback(today: string): DailyContentData {
  const day = Number(today.split("-")[2] || "1");
  return FALLBACK_VARIANTS[(day - 1) % FALLBACK_VARIANTS.length];
}

function isValidDailyContent(value: unknown): value is DailyContentData {
  if (!value || typeof value !== "object") return false;
  const content = value as Record<string, unknown>;
  return typeof content.quote === "string" && typeof content.challenge === "string" && typeof content.tip === "string";
}

export function DailyContent() {
  const [content, setContent] = useState<DailyContentData>(FALLBACK_VARIANTS[0]);
  const [activeTab, setActiveTab] = useState<"quote" | "challenge" | "tip">("quote");

  useEffect(() => {
    // Match server-side day key exactly (Asia/Kolkata + en-CA).
    const getTodayStr = () => {
      const d = new Date();
      const date = d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
      const hours = d.getHours();
      const phase = hours < 14 ? "AM" : "PM"; // 14:00 (2 PM) cutoff
      return `${date}-${phase}`;
    };

    const today = getTodayStr();
    const dailyFallback = getDailyFallback(today);
    const cached = localStorage.getItem("dailyContent");
    const cachedDate = localStorage.getItem("dailyContentDate");
    const syncKey = `${LAST_SYNC_KEY_PREFIX}:${today}`;
    const attemptKey = `${LAST_ATTEMPT_KEY_PREFIX}:${today}`;
    let isUnmounted = false;
    const isNativeApp = Capacitor.isNativePlatform();

    const loadContentFromCache = (): boolean => {
      if (cached && cachedDate === today) {
        try {
          const parsed = JSON.parse(cached);
          if (isValidDailyContent(parsed)) {
            setContent(parsed);
            return true;
          }
        } catch (e) {
          localStorage.removeItem("dailyContent");
        }
      }
      return false;
    };

    // Always show deterministic fallback immediately.
    setContent(dailyFallback);
    // Then try local cache instantly. If missing, persist fallback so UI is stable.
    const hasValidLocalCache = loadContentFromCache();
    if (!hasValidLocalCache) {
      localStorage.setItem("dailyContent", JSON.stringify(dailyFallback));
      localStorage.setItem("dailyContentDate", today);
    }
    // Finally refresh in the background: force on mount/reload, then throttled afterwards.
    void maybeRefresh(true);

    async function maybeRefresh(force = false) {
      const lastSyncTs = Number(localStorage.getItem(syncKey) || "0");
      const lastAttemptTs = Number(localStorage.getItem(attemptKey) || "0");
      const throttleMs = isNativeApp ? NATIVE_REFRESH_THROTTLE_MS : WEB_REFRESH_THROTTLE_MS;
      const failedRetryMs = isNativeApp ? NATIVE_FAILED_REFRESH_RETRY_MS : WEB_FAILED_REFRESH_RETRY_MS;
      if (!force) {
        if (Date.now() - lastSyncTs < throttleMs) {
          return;
        }
        if (Date.now() - lastAttemptTs < failedRetryMs) {
          return;
        }
      }
      localStorage.setItem(attemptKey, String(Date.now()));
      const next = await refreshDailyContent(hasValidLocalCache);
      if (!isUnmounted && next) {
        setContent(next);
      }
    }

    const onDashboardRefresh = () => {
      void maybeRefresh(true);
    };

    const onTabDeltaRefresh = (event: Event) => {
      const custom = event as CustomEvent<{ pathname?: string; force?: boolean }>;
      const path = custom.detail?.pathname || "";
      if (path.startsWith('/dashboard')) {
        void maybeRefresh(!!custom.detail?.force);
      }
    };

    window.addEventListener('orbit:dashboard-refresh', onDashboardRefresh as EventListener);
    window.addEventListener('orbit:tab-delta-refresh', onTabDeltaRefresh as EventListener);

    async function refreshDailyContent(hasLocalCache: boolean): Promise<DailyContentData | null> {
      return dedupedFetch(`daily:${today}`, async () => {
        // Skip direct Supabase read — the API endpoint has s-maxage=300 CDN caching
        // so after the first hit, Vercel's CDN serves it with 0 Supabase/CF requests.
        if (isNativeApp && hasLocalCache) {
          const lastSyncTs = Number(localStorage.getItem(syncKey) || "0");
          if (Date.now() - lastSyncTs < NATIVE_API_REFRESH_MAX_STALE_MS) {
            return null;
          }
        }

        const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "");
        const isLocalhostApiBase = !!apiBase && /localhost|127\.0\.0\.1/i.test(apiBase);
        const shouldUseApiBase = !!apiBase && (!isNativeApp || !isLocalhostApiBase);
        const candidates = ["/api/daily-content"];

        for (const fetchUrl of candidates) {
          const requestController = new AbortController();
          const timeoutId = setTimeout(() => requestController.abort(), API_TIMEOUT_MS);
          try {
            const res = await fetch(fetchUrl, {
              method: "GET",
              signal: requestController.signal,
              cache: "no-store",
            });
            if (!res.ok) throw new Error(`Fetch failed: ${res.status} (${fetchUrl})`);
            const data = await res.json();
            if (isValidDailyContent(data)) {
              localStorage.setItem("dailyContent", JSON.stringify(data));
              localStorage.setItem("dailyContentDate", today);
              localStorage.setItem(syncKey, String(Date.now()));
              return data;
            }
          } catch (e) {
            // Try next candidate
          } finally {
            clearTimeout(timeoutId);
          }
        }
        return null;
      });
    }

    return () => {
      isUnmounted = true;
      window.removeEventListener('orbit:dashboard-refresh', onDashboardRefresh as EventListener);
      window.removeEventListener('orbit:tab-delta-refresh', onTabDeltaRefresh as EventListener);
    };
  }, []);

  const { partnerProfile } = useOrbitStore();
  const partnerName = partnerProfile?.display_name || "partner";

  const tabs = [
    { id: "quote" as const, label: "Quote", icon: Quote },
    { id: "challenge" as const, label: "Challenge", icon: Heart },
    { id: "tip" as const, label: "Tip", icon: Sparkles },
  ];

  const rawText = activeTab === "quote" ? `${content.quote}` : activeTab === "challenge" ? content.challenge : content.tip;

  // Personalize the text by replacing generic "partner" with actual name
  const activeText = rawText
    .replace(/\bpartner's\b/gi, `${partnerName}'s`)
    .replace(/\bpartner\b/gi, partnerName);

  const textLen = activeText.length;

  return (
    <Card className="relative h-full flex flex-col min-h-[320px] lg:h-full gap-5 md:gap-6 p-0" glassy={true}>
      <CardHeader className="px-6 pt-6 pb-2 shrink-0 space-y-5">
        <div className="flex items-center justify-start">
          <CardTitle className="flex items-center gap-3 text-xl font-serif text-white tracking-tight">
            <Sparkles className="h-5 w-5 text-cyan-400" />
            Daily Inspiration
          </CardTitle>
        </div>

        <div className="flex p-1 bg-white/5 rounded-full relative border border-white/5 w-full max-w-[280px]">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            const Icon = tab.id === 'challenge' ? Flame : tab.icon;
            return (
              <Button
                key={tab.id}
                variant="ghost"
                size="sm"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex-1 text-[8px] md:text-[9px] uppercase tracking-[0.2em] font-black transition-all duration-300 relative z-10 h-8 px-0",
                  isActive ? "text-white" : "text-white/20 hover:text-white/40"
                )}
              >
                {isActive && (
                  <m.div
                    layoutId="daily-nav-indicator"
                    className="absolute inset-0 bg-white/10 border border-white/10 rounded-full shadow-sm"
                    transition={{
                      type: "spring",
                      bounce: 0,
                      stiffness: 150,
                      damping: 20,
                    }}
                  />
                )}
                <div className="flex items-center justify-center gap-1.5 relative z-10 px-2">
                  <Icon className="h-3 w-3" />
                  <AnimatePresence mode="wait">
                    {isActive && (
                      <m.span
                        initial={{ opacity: 0, width: 0 }}
                        animate={{ opacity: 1, width: "auto" }}
                        exit={{ opacity: 0, width: 0 }}
                        className="inline-block overflow-hidden whitespace-nowrap"
                      >
                        {tab.label}
                      </m.span>
                    )}
                  </AnimatePresence>
                </div>
              </Button>
            );
          })}
        </div>
      </CardHeader>
      <CardContent className="px-6 pb-6 flex-1 flex items-start justify-start min-h-[160px]">
        <div className="flex flex-col items-start justify-center w-full relative text-left">
          <p className={cn(
            "text-white leading-[1.6] break-words w-full font-serif font-medium",
            textLen > 160
              ? "text-[16px] md:text-[18px]"
              : textLen > 80
                ? "text-[18px] md:text-[20px]"
                : "text-[22px] md:text-[24px]"
          )}>
            {activeTab === "quote" && <span className="text-cyan-400 font-bold mr-2 text-2xl align-middle leading-none">“</span>}
            <span className="opacity-90 italic">{activeText}</span>
            {activeTab === "quote" && <span className="text-cyan-400 font-bold ml-2 text-2xl align-middle leading-none">”</span>}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
