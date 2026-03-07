"use client";

import { CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CalendarHeart, Cake, Heart, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface ImportantDatesCountdownProps {
  milestones: Record<string, any>;
  couple: any;
  profile: any;
  partnerProfile: any;
  className?: string;
}

type UpcomingEvent = {
  id: string;
  title: string;
  subtitle: string;
  daysAway: number;
  nextDate: Date;
  kind: "milestone" | "birthday" | "anniversary";
  category?: string;
  href?: string;
};

type EventTone = {
  icon: string;
  badge: string;
  accent: string;
  timer: string;
};

type EventChip = {
  emoji: string;
  label: string;
};

declare global {
  interface Window {
    __orbitDotLottieLoader?: Promise<void>;
  }
}

const MILESTONE_LABELS: Record<string, string> = {
  first_talk: "First Talk",
  first_hug: "First Hug",
  first_kiss: "First Kiss",
  first_french_kiss: "First French Kiss",
  first_sex: "First Sex",
  first_oral: "First Oral Sex",
  first_time_together: "First Bedtime Together",
  first_surprise: "First Surprise",
  first_memory: "Favourite Memory",
  first_confession: "First Confession",
  first_promise: "First Promise",
  first_night_together: "First Night Apart",
  first_time_alone: "First Time Alone",
  first_movie_date: "First Movie Date",
  first_intimate_moment: "First Intimate Moment",
};

const MILESTONE_SUBTITLES: Record<string, string> = {
  first_talk: "First conversation memory",
  first_hug: "Warmth memory anniversary",
  first_kiss: "Intimacy memory anniversary",
  first_french_kiss: "Deep kiss memory anniversary",
  first_sex: "Private memory anniversary",
  first_oral: "Private memory anniversary",
  first_time_together: "Night memory anniversary",
  first_surprise: "Surprise memory anniversary",
  first_memory: "Memory anniversary",
  first_confession: "Confession memory anniversary",
  first_promise: "Promise memory anniversary",
  first_night_together: "Distance memory anniversary",
  first_time_alone: "Private time anniversary",
  first_movie_date: "Date memory anniversary",
  first_intimate_moment: "Romantic memory anniversary",
};

const EVENT_TONE: Record<string, EventTone> = {
  first_talk: {
    icon: "border-cyan-400/40 text-cyan-100", badge: "border-cyan-400/40 text-cyan-100", accent: "text-cyan-100",
    timer: "border-cyan-400/30 bg-cyan-500/15",
  },
  first_hug: {
    icon: "border-orange-400/40 text-orange-100", badge: "border-orange-400/40 text-orange-100", accent: "text-orange-100",
    timer: "border-orange-400/30 bg-orange-500/15",
  },
  first_kiss: {
    icon: "border-rose-400/40 text-rose-100", badge: "border-rose-400/40 text-rose-100", accent: "text-rose-100",
    timer: "border-rose-400/30 bg-rose-500/15",
  },
  first_french_kiss: {
    icon: "border-red-400/40 text-red-100", badge: "border-red-400/40 text-red-100", accent: "text-red-100",
    timer: "border-red-400/30 bg-red-500/15",
  },
  first_sex: {
    icon: "border-fuchsia-400/40 text-fuchsia-100", badge: "border-fuchsia-400/40 text-fuchsia-100", accent: "text-fuchsia-100",
    timer: "border-fuchsia-400/30 bg-fuchsia-500/15",
  },
  first_oral: {
    icon: "border-indigo-400/40 text-indigo-100", badge: "border-indigo-400/40 text-indigo-100", accent: "text-indigo-100",
    timer: "border-indigo-400/30 bg-indigo-500/15",
  },
  first_time_together: {
    icon: "border-violet-400/40 text-violet-100", badge: "border-violet-400/40 text-violet-100", accent: "text-violet-100",
    timer: "border-violet-400/30 bg-violet-500/15",
  },
  first_surprise: {
    icon: "border-emerald-400/40 text-emerald-100", badge: "border-emerald-400/40 text-emerald-100", accent: "text-emerald-100",
    timer: "border-emerald-400/30 bg-emerald-500/15",
  },
  first_memory: {
    icon: "border-amber-400/40 text-amber-100", badge: "border-amber-400/40 text-amber-100", accent: "text-amber-100",
    timer: "border-amber-400/30 bg-amber-500/15",
  },
  first_confession: {
    icon: "border-pink-400/40 text-pink-100", badge: "border-pink-400/40 text-pink-100", accent: "text-pink-100",
    timer: "border-pink-400/30 bg-pink-500/15",
  },
  first_promise: {
    icon: "border-teal-400/40 text-teal-100", badge: "border-teal-400/40 text-teal-100", accent: "text-teal-100",
    timer: "border-teal-400/30 bg-teal-500/15",
  },
  first_night_together: {
    icon: "border-slate-400/40 text-slate-100", badge: "border-slate-400/40 text-slate-100", accent: "text-slate-100",
    timer: "border-slate-400/30 bg-slate-500/15",
  },
  first_time_alone: {
    icon: "border-purple-400/40 text-purple-100", badge: "border-purple-400/40 text-purple-100", accent: "text-purple-100",
    timer: "border-purple-400/30 bg-purple-500/15",
  },
  first_movie_date: {
    icon: "border-orange-400/40 text-orange-100", badge: "border-orange-400/40 text-orange-100", accent: "text-orange-100",
    timer: "border-orange-400/30 bg-orange-500/15",
  },
  first_intimate_moment: {
    icon: "border-rose-400/40 text-rose-100", badge: "border-rose-400/40 text-rose-100", accent: "text-rose-100",
    timer: "border-rose-400/30 bg-rose-500/15",
  },
  birthday: {
    icon: "border-sky-400/40 text-sky-100", badge: "border-sky-400/40 text-sky-100", accent: "text-sky-100",
    timer: "border-sky-400/30 bg-sky-500/15",
  },
  anniversary: {
    icon: "border-rose-400/40 text-rose-100", badge: "border-rose-400/40 text-rose-100", accent: "text-rose-100",
    timer: "border-rose-400/30 bg-rose-500/15",
  },
};

const EVENT_CHIP: Record<string, EventChip> = {
  first_talk: { emoji: "\u{1F4AC}", label: "Talk" },
  first_hug: { emoji: "\u{1FAC2}", label: "Hug" },
  first_kiss: { emoji: "\u{1F48B}", label: "Kiss" },
  first_french_kiss: { emoji: "\u{1F525}", label: "Flame" },
  first_sex: { emoji: "\u{1F49E}", label: "Intimacy" },
  first_oral: { emoji: "\u{1F30A}", label: "Desire" },
  first_time_together: { emoji: "\u{1F319}", label: "Night" },
  first_surprise: { emoji: "\u{1F381}", label: "Surprise" },
  first_memory: { emoji: "\u{1F4F8}", label: "Memory" },
  first_confession: { emoji: "\u{1F48C}", label: "Confession" },
  first_promise: { emoji: "\u{1F91D}", label: "Promise" },
  first_night_together: { emoji: "\u{1F6CC}", label: "Apart Night" },
  first_time_alone: { emoji: "\u{1F92B}", label: "Private" },
  first_movie_date: { emoji: "\u{1F3AC}", label: "Movie Date" },
  first_intimate_moment: { emoji: "\u{1F339}", label: "Romance" },
  birthday: { emoji: "\u{1F382}", label: "Birthday" },
  anniversary: { emoji: "\u{1F496}", label: "Anniversary" },
};

const CARD_GRADIENT: Record<string, string> = {
  first_talk: "text-cyan-50",
  first_hug: "text-orange-50",
  first_kiss: "text-rose-50",
  first_french_kiss: "text-red-50",
  first_sex: "text-rose-50",
  first_oral: "text-pink-50",
  first_time_together: "text-violet-50",
  first_surprise: "text-emerald-50",
  first_memory: "text-amber-50",
  first_confession: "text-pink-50",
  first_promise: "text-teal-50",
  first_night_together: "text-slate-50",
  first_time_alone: "text-purple-50",
  first_movie_date: "text-orange-50",
  first_intimate_moment: "text-rose-50",
  birthday: "text-sky-50",
  anniversary: "text-rose-50",
};

function parseDateOnly(value?: string | null): Date | null {
  if (!value) return null;
  const raw = String(value).split("T")[0].trim();
  if (!raw) return null;

  const normalized = raw.replace(/\./g, "/").replace(/-/g, "/");
  const parts = normalized.split("/");
  if (parts.length !== 3) return null;

  let y = 0;
  let m = 0;
  let d = 0;

  // yyyy/mm/dd
  if (parts[0].length === 4) {
    y = Number(parts[0]);
    m = Number(parts[1]);
    d = Number(parts[2]);
  } else if (parts[2].length === 4) {
    // dd/mm/yyyy (legacy/user-entered format, common in India)
    d = Number(parts[0]);
    m = Number(parts[1]);
    y = Number(parts[2]);
  } else {
    return null;
  }

  if (!y || !m || !d || m < 1 || m > 12 || d < 1 || d > 31) return null;

  const dt = new Date(y, m - 1, d);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function parseTimeOnly(value?: string | null): { hours: number; minutes: number } {
  if (!value) return { hours: 0, minutes: 0 };
  const match = String(value).trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return { hours: 0, minutes: 0 };
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return { hours: 0, minutes: 0 };
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return { hours: 0, minutes: 0 };
  return { hours, minutes };
}

function getDaysUntilNextAnnual(value?: string | null, time?: string | null) {
  const base = parseDateOnly(value);
  if (!base) return null;

  const now = new Date();
  const { hours, minutes } = parseTimeOnly(time);
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  let next = new Date(now.getFullYear(), base.getMonth(), base.getDate(), hours, minutes, 0, 0);
  if (next.getTime() < now.getTime()) {
    next = new Date(now.getFullYear() + 1, base.getMonth(), base.getDate(), hours, minutes, 0, 0);
  }

  const nextStart = new Date(next.getFullYear(), next.getMonth(), next.getDate());
  const daysAway = Math.round((nextStart.getTime() - todayStart.getTime()) / (1000 * 60 * 60 * 24));
  return { nextDate: next, daysAway };
}

function formatDays(days: number) {
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `In ${days} days`;
}

function getClockParts(msRemaining: number) {
  const safeSeconds = Math.max(0, Math.floor(msRemaining / 1000));
  const days = Math.floor(safeSeconds / 86400);
  const hrs = Math.floor((safeSeconds % 86400) / 3600);
  const min = Math.floor((safeSeconds % 3600) / 60);
  const sec = safeSeconds % 60;
  const longMode = safeSeconds > 86400;
  return {
    longMode,
    aLabel: longMode ? "DAYS" : "HRS",
    bLabel: longMode ? "HRS" : "MIN",
    cLabel: longMode ? "MIN" : "SEC",
    aValue: String(longMode ? days : hrs).padStart(2, "0"),
    bValue: String(longMode ? hrs : min).padStart(2, "0"),
    cValue: String(longMode ? min : sec).padStart(2, "0"),
  };
}

function getCardBackground(category?: string) {
  switch (category) {
    case "birthday":
      return "radial-gradient(circle at 18% 22%, rgba(125, 211, 252, 0.14), transparent 58%), radial-gradient(circle at 82% 80%, rgba(56, 189, 248, 0.12), transparent 58%), linear-gradient(140deg, #133f5d 0%, #0d2d43 56%, #081b2a 100%)";
    case "anniversary":
      return "radial-gradient(circle at 18% 22%, rgba(251, 113, 133, 0.14), transparent 58%), radial-gradient(circle at 80% 82%, rgba(244, 114, 182, 0.12), transparent 58%), linear-gradient(140deg, #4b2033 0%, #321527 56%, #1b0f18 100%)";
    case "first_sex":
    case "first_intimate_moment":
    case "first_oral":
      return "radial-gradient(circle at 18% 22%, rgba(244, 114, 182, 0.14), transparent 58%), radial-gradient(circle at 80% 82%, rgba(167, 139, 250, 0.12), transparent 58%), linear-gradient(140deg, #43203a 0%, #2e1728 56%, #190f18 100%)";
    case "first_hug":
      return "radial-gradient(circle at 18% 22%, rgba(251, 191, 36, 0.12), transparent 58%), radial-gradient(circle at 80% 82%, rgba(249, 115, 22, 0.1), transparent 58%), linear-gradient(140deg, #433126 0%, #302319 56%, #1a1410 100%)";
    default:
      return "radial-gradient(circle at 18% 22%, rgba(147, 197, 253, 0.12), transparent 58%), radial-gradient(circle at 80% 82%, rgba(196, 181, 253, 0.1), transparent 58%), linear-gradient(140deg, #1f2f45 0%, #192638 56%, #111a28 100%)";
  }
}

function getMotionSprites(category?: string) {
  switch (category) {
    case "anniversary":
      return ["\u{1F496}", "\u{1F49E}", "\u{1F48D}", "\u2728"];
    case "birthday":
      return ["\u{1F382}", "\u{1F380}", "\u{1F389}", "\u2728"];
    case "first_talk":
      return ["\u{1F4AC}", "\u{1FAF6}", "\u2728", "\u{1F319}"];
    case "first_hug":
      return ["\u{1FAC2}", "\u{1F49B}", "\u2728", "\u{1F9F8}"];
    case "first_kiss":
      return ["\u{1F48B}", "\u{1F495}", "\u2728", "\u{1F339}"];
    case "first_french_kiss":
      return ["\u{1F48B}", "\u{1F525}", "\u2764\uFE0F", "\u2728"];
    case "first_sex":
      return ["\u{1F525}", "\u2764\uFE0F\u200D\u{1F525}", "\u2728", "\u{1F339}"];
    case "first_oral":
      return ["\u{1F336}\uFE0F", "\u2764\uFE0F\u200D\u{1F525}", "\u2728", "\u{1F4AB}"];
    case "first_intimate_moment":
      return ["\u{1F339}", "\u2764\uFE0F\u200D\u{1F525}", "\u2728", "\u{1F496}"];
    case "first_time_together":
      return ["\u{1F319}", "\u{1F6CC}", "\u2728", "\u{1F4AB}"];
    case "first_surprise":
      return ["\u{1F381}", "\u{1F38A}", "\u2728", "\u{1F49D}"];
    case "first_memory":
      return ["\u{1F4F8}", "\u{1F5BC}\uFE0F", "\u2728", "\u{1F4AB}"];
    case "first_confession":
      return ["\u{1F48C}", "\u{1F90D}", "\u2728", "\u{1F319}"];
    case "first_promise":
      return ["\u{1F91D}", "\u{1F4AB}", "\u2728", "\u{1FAF6}"];
    case "first_night_together":
      return ["\u{1F30C}", "\u{1F6CF}\uFE0F", "\u2728", "\u{1F499}"];
    case "first_time_alone":
      return ["\u{1F92B}", "\u{1FAF6}", "\u2728", "\u{1F319}"];
    case "first_movie_date":
      return ["\u{1F3AC}", "\u{1F37F}", "\u2728", "\u{1F49E}"];
    default:
      return ["\u2728", "\u{1F4AB}", "\u{1F319}", "\u{1F90D}"];
  }
}

async function ensureLottieLoaded() {
  if (typeof window === "undefined") return;
  if (!window.__orbitDotLottieLoader) {
    window.__orbitDotLottieLoader = new Promise<void>((resolve, reject) => {
      const existing = document.querySelector("script[data-orbit-dotlottie='1']") as HTMLScriptElement | null;
      if (existing) {
        existing.addEventListener("load", () => resolve(), { once: true });
        existing.addEventListener("error", () => reject(new Error("Failed to load dotlottie player")), { once: true });
        return;
      }
      const script = document.createElement("script");
      script.type = "module";
      script.src = "https://unpkg.com/@dotlottie/player-component@2.7.12/dist/dotlottie-player.mjs";
      script.async = true;
      script.dataset.orbitDotlottie = "1";
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Failed to load dotlottie player"));
      document.head.appendChild(script);
    });
  }
  await window.__orbitDotLottieLoader;
}

function getDotLottiePath(category?: string) {
  switch (category) {
    case "anniversary":
      return "/animations/countdown/anniversary.lottie";
    case "birthday":
      return "/animations/countdown/birthday.lottie";
    case "first_hug":
      return "/animations/countdown/first-hug.lottie";
    case "first_kiss":
      return "/animations/countdown/first-kiss.lottie";
    case "first_french_kiss":
      return "/animations/countdown/first-french-kiss.lottie";
    default:
      return "/animations/countdown/default.lottie";
  }
}

export function ImportantDatesCountdown({
  milestones,
  couple,
  profile,
  partnerProfile,
  className,
}: ImportantDatesCountdownProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const lottieHostRef = useRef<HTMLDivElement | null>(null);
  const lottiePlayerRef = useRef<HTMLElement | null>(null);
  const lottieSrcRef = useRef<string>("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [touchEndX, setTouchEndX] = useState<number | null>(null);
  const [nowTs, setNowTs] = useState(() => Date.now());
  const [allowMotion, setAllowMotion] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const [isDocumentVisible, setIsDocumentVisible] = useState(true);

  const upcoming = useMemo(() => {
    const events: UpcomingEvent[] = [];

    const anniversary = getDaysUntilNextAnnual(couple?.anniversary_date);
    if (anniversary) {
      events.push({
        id: "anniversary",
        title: "Anniversary",
        subtitle: "Your couple date",
        daysAway: anniversary.daysAway,
        nextDate: anniversary.nextDate,
        kind: "anniversary",
        category: "anniversary",
        href: "/settings",
      });
    }

    const myBirthday = getDaysUntilNextAnnual(profile?.birthday);
    if (myBirthday) {
      events.push({
        id: "my-birthday",
        title: "Your Birthday",
        subtitle: "Personal celebration",
        daysAway: myBirthday.daysAway,
        nextDate: myBirthday.nextDate,
        kind: "birthday",
        category: "birthday",
        href: "/settings",
      });
    }

    const partnerBirthday = getDaysUntilNextAnnual(partnerProfile?.birthday);
    if (partnerBirthday) {
      events.push({
        id: "partner-birthday",
        title: `${partnerProfile?.display_name || "Partner"}'s Birthday`,
        subtitle: "Plan something sweet",
        daysAway: partnerBirthday.daysAway,
        nextDate: partnerBirthday.nextDate,
        kind: "birthday",
        category: "birthday",
        href: "/settings",
      });
    }

    Object.entries(milestones || {}).forEach(([category, row]) => {
      const label = MILESTONE_LABELS[category];
      if (!label) return;

      const sourceDate = row?.milestone_date || row?.date_user1 || row?.date_user2;
      const sourceTime = row?.milestone_time;
      const next = getDaysUntilNextAnnual(sourceDate, sourceTime);
      if (!next) return;

      events.push({
        id: `milestone-${category}`,
        title: label,
        subtitle: MILESTONE_SUBTITLES[category] || "Memory anniversary",
        daysAway: next.daysAway,
        nextDate: next.nextDate,
        kind: "milestone",
        category,
        href: `/intimacy?q=${category}`,
      });
    });

    return events
      .filter((event) => event.daysAway >= 0 && event.daysAway <= 30)
      .sort((a, b) => a.daysAway - b.daysAway)
      .slice(0, 8);
  }, [couple?.anniversary_date, milestones, partnerProfile?.birthday, partnerProfile?.display_name, profile?.birthday]);

  const hasUpcoming = upcoming.length > 0;
  const hasMultiple = upcoming.length > 1;
  const safeIndex = hasUpcoming ? Math.min(activeIndex, upcoming.length - 1) : 0;
  const current = hasUpcoming ? upcoming[safeIndex] : null;
  const tone = EVENT_TONE[current?.category || ""] || {
    icon: "border-white/30 text-white",
    badge: "border-white/30 text-white",
    accent: "text-white",
  };
  const chip = EVENT_CHIP[current?.category || ""] || { emoji: "\u2728", label: "Upcoming" };
  const cardGradient = CARD_GRADIENT[current?.category || ""] || "text-white";
  const cardBackground = getCardBackground(current?.category);
  const motionSprites = getMotionSprites(current?.category);
  const motionTier = !current ? "low" : current.daysAway <= 3 ? "high" : current.daysAway <= 7 ? "mid" : "low";
  const activeSprites = motionSprites.slice(0, motionTier === "high" ? 4 : motionTier === "mid" ? 3 : 2);
  const shouldRunLottie = Boolean(current && current.daysAway <= 7 && allowMotion && isInView && isDocumentVisible);

  const countdownTarget = current ? current.nextDate.getTime() : null;
  const clock = getClockParts(countdownTarget ? countdownTarget - nowTs : 0);

  useEffect(() => {
    if (!countdownTarget) return;

    const now = Date.now();
    const remaining = countdownTarget - now;
    const oneDayMs = 24 * 60 * 60 * 1000;
    const within24Hours = remaining <= oneDayMs;

    let delay = 1000;
    if (!within24Hours) {
      const msToNextMinute = 60_000 - (now % 60_000);
      delay = Math.max(1000, msToNextMinute);
    }

    const timeoutId = window.setTimeout(() => setNowTs(Date.now()), delay);
    return () => window.clearTimeout(timeoutId);
  }, [countdownTarget, nowTs]);

  const currentEvent = hasUpcoming ? upcoming[safeIndex] : null;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const mobile = window.matchMedia("(max-width: 1024px)");

    const apply = () => {
      const perfLite = document.documentElement.getAttribute("data-performance") === "lite";
      setAllowMotion(!reduced.matches && mobile.matches && !perfLite);
    };
    apply();

    reduced.addEventListener("change", apply);
    mobile.addEventListener("change", apply);
    window.addEventListener("orbit:performance-mode-changed", apply as EventListener);
    return () => {
      reduced.removeEventListener("change", apply);
      mobile.removeEventListener("change", apply);
      window.removeEventListener("orbit:performance-mode-changed", apply as EventListener);
    };
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const onVisibility = () => setIsDocumentVisible(document.visibilityState === "visible");
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    const node = rootRef.current;
    if (!node || !allowMotion || !currentEvent) {
      setIsInView(false);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        setIsInView(Boolean(entry?.isIntersecting));
      },
      { threshold: 0.3 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [allowMotion, currentEvent?.id]);

  useEffect(() => {
    const host = lottieHostRef.current;
    if (!host) return;

    let cancelled = false;
    (async () => {
      try {
        await ensureLottieLoaded();
        if (cancelled) return;

        let player = lottiePlayerRef.current;
        if (!player) {
          player = document.createElement("dotlottie-player");
          player.setAttribute("loop", "");
          player.setAttribute("mode", "normal");
          player.setAttribute("renderer", "svg");
          player.style.width = "100%";
          player.style.height = "100%";
          host.innerHTML = "";
          host.appendChild(player);
          lottiePlayerRef.current = player;
        }

        const nextSrc = getDotLottiePath(currentEvent?.category);
        if (nextSrc !== lottieSrcRef.current) {
          player.setAttribute("src", nextSrc);
          lottieSrcRef.current = nextSrc;
        }

        if (shouldRunLottie) {
          player.setAttribute("autoplay", "");
          (player as any).play?.();
          player.style.visibility = "visible";
          player.style.opacity = "1";
        } else {
          player.removeAttribute("autoplay");
          (player as any).pause?.();
          player.style.visibility = "hidden";
          player.style.opacity = "0";
        }
      } catch {
        // CSS motion remains the fallback.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [shouldRunLottie, currentEvent?.category]);

  useEffect(() => {
    return () => {
      const host = lottieHostRef.current;
      if (host) host.innerHTML = "";
      lottiePlayerRef.current = null;
      lottieSrcRef.current = "";
    };
  }, []);

  if (!hasUpcoming || !currentEvent) return null;

  const movePrev = () => {
    if (!hasMultiple) return;
    setActiveIndex((prev) => (prev - 1 + upcoming.length) % upcoming.length);
  };

  const moveNext = () => {
    if (!hasMultiple) return;
    setActiveIndex((prev) => (prev + 1) % upcoming.length);
  };

  const handleTouchEnd = () => {
    if (!hasMultiple || touchStartX === null || touchEndX === null) {
      setTouchStartX(null);
      setTouchEndX(null);
      return;
    }
    const delta = touchStartX - touchEndX;
    if (Math.abs(delta) >= 45) {
      if (delta > 0) moveNext();
      else movePrev();
    }
    setTouchStartX(null);
    setTouchEndX(null);
  };

  const content = (
    <div className="rounded-2xl border border-white/15 bg-transparent px-4 py-3.5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex items-center gap-3">
          <div className={cn("h-9 w-9 rounded-full border bg-transparent flex items-center justify-center", tone.icon)}>
            {currentEvent.kind === "birthday" ? (
              <Cake className="h-4 w-4" />
            ) : currentEvent.kind === "anniversary" ? (
              <Heart className="h-4 w-4" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
          </div>
          <div className="min-w-0">
            <p className={cn("text-base md:text-lg font-serif font-semibold truncate leading-tight", tone.accent)}>{currentEvent.title}</p>
            <p className="text-[9px] md:text-[10px] uppercase tracking-[0.12em] md:tracking-[0.14em] text-white/50 truncate">{currentEvent.subtitle}</p>
          </div>
        </div>
        <div className={cn("rounded-full border bg-transparent px-2.5 md:px-3 py-1 md:py-1.5 text-xs md:text-sm font-black whitespace-nowrap", tone.badge)}>
          {formatDays(currentEvent.daysAway)}
        </div>
      </div>
    </div>
  );

  return (
    <div ref={rootRef} className={cn("relative h-full min-h-[320px] event-gradient-card countdown-card rounded-none border-0 p-5 flex flex-col overflow-hidden shadow-xl", cardGradient, className)}>
      <div
        className="pointer-events-none absolute inset-0 z-0"
        style={{ backgroundImage: cardBackground }}
      />
      <div className="pointer-events-none absolute inset-0 z-0 bg-black/18" />
      <div className="pointer-events-none absolute -top-24 -right-12 z-0 h-48 w-48 rounded-full bg-white/8 blur-3xl" />
      <div
        ref={lottieHostRef}
        className="pointer-events-none absolute right-2 top-10 z-[9] h-16 w-16 opacity-40 md:h-20 md:w-20"
        aria-hidden
      />
      {allowMotion && isInView && isDocumentVisible && (
        <div className="pointer-events-none absolute inset-0 z-[8] overflow-hidden">
          {(shouldRunLottie ? activeSprites.slice(1) : activeSprites).map((sprite, idx) => {
            const duration = motionTier === "high"
              ? 9 + idx * 1.2
              : motionTier === "mid"
                ? 11 + idx * 1.6
                : 13 + idx * 1.9;
            const spriteStyle = {
              top: `${(shouldRunLottie ? 34 : 18) + idx * (motionTier === "high" ? 20 : 24)}%`,
              ["--duration" as string]: `${duration}s`,
              ["--delay" as string]: `${idx * 1.2}s`,
            } as CSSProperties;
            return (
              <span
                key={`${currentEvent.id}-${sprite}-${idx}`}
                className={cn("countdown-sprite", idx % 2 === 1 && "reverse")}
                style={spriteStyle}
                aria-hidden
              >
                {sprite}
              </span>
            );
          })}
        </div>
      )}

      <div className="relative z-10 flex items-center justify-between mb-4">
        <div className="inline-flex items-center gap-2">
          <CalendarHeart className="h-4 w-4 text-white/70" />
          <span className="text-[11px] uppercase tracking-[0.3em] font-serif font-semibold text-white/85">Countdown</span>
        </div>
        <div className={cn("inline-flex items-center gap-1.5 rounded-full border-0 md:border bg-transparent px-2.5 py-1 text-[10px] font-bold tracking-wider", tone.badge)}>
          <span>{chip.emoji}</span>
          <span className="uppercase">{chip.label}</span>
        </div>
      </div>

      <div
        className="relative z-10 flex-1 flex flex-col justify-center space-y-3 pb-1"
        onTouchStart={(e) => setTouchStartX(e.changedTouches[0]?.clientX ?? null)}
        onTouchMove={(e) => setTouchEndX(e.changedTouches[0]?.clientX ?? null)}
        onTouchEnd={handleTouchEnd}
      >
        {currentEvent.href ? (
          <Link href={currentEvent.href} className="block">
            {content}
          </Link>
        ) : (
          content
        )}

        <div className="grid grid-cols-3 gap-2.5">
          <div className={cn("rounded-2xl border px-2 py-3 text-center", tone.timer)}>
            <p className={cn("text-3xl md:text-4xl font-black leading-none tracking-tight", tone.accent)}>{clock.aValue}</p>
            <p className="text-[9px] mt-1 font-black tracking-[0.28em] text-white/80">{clock.aLabel}</p>
          </div>
          <div className={cn("rounded-2xl border px-2 py-3 text-center", tone.timer)}>
            <p className={cn("text-3xl md:text-4xl font-black leading-none tracking-tight", tone.accent)}>{clock.bValue}</p>
            <p className="text-[9px] mt-1 font-black tracking-[0.28em] text-white/80">{clock.bLabel}</p>
          </div>
          <div className={cn("rounded-2xl border px-2 py-3 text-center", tone.timer)}>
            <p className={cn("text-3xl md:text-4xl font-black leading-none tracking-tight", tone.accent)}>{clock.cValue}</p>
            <p className="text-[9px] mt-1 font-black tracking-[0.28em] text-white/80">{clock.cLabel}</p>
          </div>
        </div>

        {hasMultiple && (
          <div className="mt-1 flex items-center justify-center">
            <div className="flex items-center gap-1.5">
              {upcoming.map((event, idx) => (
                <button
                  key={event.id}
                  type="button"
                  onClick={() => setActiveIndex(idx)}
                  className={cn(
                    "h-1 rounded-full transition-all",
                    idx === safeIndex ? "w-4 bg-white/75" : "w-1 bg-white/30"
                  )}
                  aria-label={`View event ${idx + 1}`}
                />
              ))}
            </div>
          </div>
        )}
      </div>
      <style jsx>{`
        .countdown-sprite {
          position: absolute;
          left: -12%;
          font-size: 16px;
          opacity: 0.56;
          filter: drop-shadow(0 2px 8px rgba(0, 0, 0, 0.18));
          animation:
            drift-x var(--duration) linear var(--delay) infinite,
            drift-y 2.8s ease-in-out var(--delay) infinite;
          will-change: transform;
        }
        .countdown-sprite.reverse {
          left: 112%;
          animation:
            drift-x-rev var(--duration) linear var(--delay) infinite,
            drift-y 3.2s ease-in-out var(--delay) infinite;
        }
        @keyframes drift-x {
          0% { transform: translate3d(0, 0, 0) rotate(-8deg); }
          100% { transform: translate3d(125vw, 0, 0) rotate(8deg); }
        }
        @keyframes drift-x-rev {
          0% { transform: translate3d(0, 0, 0) rotate(8deg); }
          100% { transform: translate3d(-125vw, 0, 0) rotate(-8deg); }
        }
        @keyframes drift-y {
          0%, 100% { margin-top: 0; }
          50% { margin-top: -8px; }
        }
      `}</style>
    </div>
  );
}
