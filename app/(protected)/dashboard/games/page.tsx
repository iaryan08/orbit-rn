"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Gamepad2, Heart, Flame, Sparkles, MessageCircle, Dice6, ChevronRight } from "lucide-react";
import { TruthOrDare } from "@/components/games/truth-or-dare";
import { WouldYouRather } from "@/components/games/would-you-rather";
import { LoveQuiz } from "@/components/games/love-quiz";
import { motion } from "framer-motion";
import { Capacitor } from "@capacitor/core";

type GameType = "menu" | "truth-or-dare" | "would-you-rather" | "love-quiz";

const games = [
  {
    id: "truth-or-dare" as const,
    title: "Truth or Dare",
    description: "Spicy questions and playful challenges to ignite the spark.",
    icon: Flame,
    badge: "Popular",
    color: "text-rose-400",
    bgColor: "bg-rose-500/10",
    borderColor: "border-rose-500/20"
  },
  {
    id: "would-you-rather" as const,
    title: "Would You Rather",
    description: "Fascinating dilemmas to explore each other's hidden layers.",
    icon: MessageCircle,
    badge: "Insightful",
    color: "text-indigo-400",
    bgColor: "bg-indigo-500/10",
    borderColor: "border-indigo-500/20"
  },
  {
    id: "love-quiz" as const,
    title: "Love Quiz",
    description: "The ultimate harmony test. How well do you really know her?",
    icon: Heart,
    badge: "Legacy",
    color: "text-amber-400",
    bgColor: "bg-amber-500/10",
    borderColor: "border-amber-500/20"
  },
];

export default function GamesPage() {
  const [activeGame, setActiveGame] = useState<GameType>("menu");
  const isNative = Capacitor.isNativePlatform();

  if (activeGame === "truth-or-dare") {
    return <TruthOrDare onBack={() => setActiveGame("menu")} />;
  }

  if (activeGame === "would-you-rather") {
    return <WouldYouRather onBack={() => setActiveGame("menu")} />;
  }

  if (activeGame === "love-quiz") {
    return <LoveQuiz onBack={() => setActiveGame("menu")} />;
  }

  return (
    <div
      className={cn(
        "container mx-auto px-6 md:px-8 space-y-12 pb-6 md:pb-12 pt-20 md:pt-16 lg:pt-16",
        isNative ? "pt-12" : ""
      )}
    >
      {/* Elegant Header */}
      <div>
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl md:text-5xl font-serif text-white tracking-tight">
            Games
          </h1>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10 md:gap-12">
        {games.map((game, idx) => (
          <div key={game.id}  className="h-full">
            <div
              className={cn(
                "group relative glass-card p-6 md:p-8 min-h-[300px] h-full flex flex-col justify-between rounded-2xl border-white/5 bg-black/20 transition-all duration-500 hover:border-white/20 hover:shadow-2xl hover:-translate-y-2 cursor-pointer overflow-hidden"
              )}
              onClick={() => setActiveGame(game.id)}
            >
              {/* Visual Flairs */}
              <div className={cn("absolute -top-16 -right-16 w-56 h-56 blur-[60px] opacity-20 transition-opacity group-hover:opacity-40", game.bgColor)} />

              <div className="space-y-6 relative z-10">
                <div className="flex items-start justify-between">
                  <div className={cn("p-4 rounded-2xl border transition-all duration-500 group-hover:scale-110", game.bgColor, game.borderColor, game.color)}>
                    <game.icon className="w-6 h-6" />
                  </div>
                  <div className="px-2.5 py-0.5 rounded-full bg-white/5 border border-white/10">
                    <span className="text-[7px] font-black uppercase tracking-[0.2em] text-white/30">{game.badge}</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <h2 className="text-xl font-serif text-white tracking-tight">{game.title}</h2>
                  <p className="text-xs text-white/40 leading-relaxed font-serif italic">"{game.description}"</p>
                </div>
              </div>

              <div className="pt-6 relative z-10">
                <Button className="w-full h-12 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl flex items-center justify-between px-5 group/btn">
                  <span className="text-[9px] uppercase tracking-[.2em] font-black text-white/60 group-hover/btn:text-white transition-colors">Start Game</span>
                  <div className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center group-hover/btn:bg-white/20 transition-colors">
                    <ChevronRight className="w-3.5 h-3.5 text-white" />
                  </div>
                </Button>
              </div>

              {/* Decorative sync badge */}
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none">
                <div className="h-1 w-1 rounded-full bg-amber-400 animate-pulse" />
                <span className="text-[7px] font-black uppercase tracking-[0.2em] text-amber-200/40">Real-time Sync Active</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div >
        <div className="glass-card p-8 md:p-10 border-dashed border-white/5 bg-transparent rounded-2xl flex flex-col items-center text-center gap-4">
          <div className="w-12 h-12 rounded-full bg-white/5 border border-white/5 flex items-center justify-center">
            <Sparkles className="h-5 w-5 text-white/10 animate-pulse" />
          </div>
          <div className="space-y-1.5">
            <h3 className="text-lg font-serif text-white/60">More layers to uncover...</h3>
            <p className="text-[9px] text-white/20 uppercase tracking-[.2em] font-black">Developing new playful dialogues</p>
          </div>
        </div>
      </div>
    </div>
  );
}

