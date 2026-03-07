"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, MessageCircle, RefreshCw, Loader2, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { db, auth } from "@/lib/firebase/client";
import { doc, getDoc, setDoc, onSnapshot, serverTimestamp } from "firebase/firestore";
import { useOrbitStore } from "@/lib/store/global-store";

interface WouldYouRatherProps {
  onBack: () => void;
}

const questions = [
  { a: "Never be able to leave your hometown", b: "Never be able to settle down in one place" },
  { a: "Know how you will die", b: "Know when you will die" },
  { a: "Have unlimited money", b: "Have unlimited love" },
  { a: "Be able to read minds", b: "Be able to predict the future" },
  { a: "Relive the same day forever", b: "Fast forward to the end of your life" },
  { a: "Have a rewind button for your life", b: "Have a pause button for your life" },
  { a: "Be famous but alone", b: "Be unknown but surrounded by loved ones" },
  { a: "Travel back in time", b: "Travel to the future" },
  { a: "Have more time", b: "Have more money" },
  { a: "Be able to fly", b: "Be able to teleport" },
  { a: "Live in a world without music", b: "Live in a world without movies" },
  { a: "Always speak your mind", b: "Never speak again" },
  { a: "Have a personal chef", b: "Have a personal driver" },
  { a: "Live in the mountains", b: "Live by the beach" },
  { a: "Give up social media forever", b: "Give up watching movies/TV forever" },
  { a: "Plan a surprise date for me", b: "Have me plan a surprise date for you" },
  { a: "Spend a romantic weekend at home", b: "Go on an adventure trip together" },
  { a: "Receive love letters", b: "Receive surprise gifts" },
  { a: "Cook dinner together every night", b: "Go out to dinner every night" },
  { a: "Know everything your partner thinks", b: "Have your partner know everything you think" },
  { a: "Have one epic vacation a year", b: "Have many small getaways throughout the year" },
  { a: "Grow old together in one place", b: "Travel the world together forever" },
  { a: "Always make your partner laugh", b: "Always make your partner feel loved" },
];

interface GameState {
  currentIndex: number;
  choices: Record<string, "a" | "b">;
  revealed: boolean;
  initiatorId: string;
}

export function WouldYouRather({ onBack }: WouldYouRatherProps) {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const user = auth.currentUser;
  const orbitStore = useOrbitStore();
  const coupleId = orbitStore.couple?.id || orbitStore.profile?.couple_id;
  const partnerId = orbitStore.couple ? (orbitStore.couple.user1_id === user?.uid ? orbitStore.couple.user2_id : orbitStore.couple.user1_id) : null;

  useEffect(() => {
    if (!coupleId || !user) {
      setLoading(false);
      return;
    }

    const gameRef = doc(db, "couples", coupleId, "game_sessions", "would-you-rather");

    const unsubscribe = onSnapshot(gameRef, (doc) => {
      if (doc.exists()) {
        const data = doc.data();
        setGameState(data.game_data as GameState);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [coupleId, user]);

  // Automatic State Repair / Self-Healing for WYR
  useEffect(() => {
    if (!gameState || !user || !partnerId) return;

    const myId = user.uid.toLowerCase();
    const pId = partnerId.toLowerCase();

    // If both have chosen in the `choices` object but `revealed` is false, fix it.
    if (gameState.choices[myId] && gameState.choices[pId] && !gameState.revealed) {
      console.log("Deadlock detected (Both answered but not revealed), repairing...");
      const repairedState = { ...gameState, revealed: true };
      setGameState(repairedState);
      updateRemoteState(repairedState);
    }
  }, [gameState, user, partnerId]);

  const updateRemoteState = async (newState: GameState) => {
    if (!coupleId) return;
    const gameRef = doc(db, "couples", coupleId, "game_sessions", "would-you-rather");
    try {
      await setDoc(gameRef, {
        game_type: "would-you-rather",
        game_data: newState,
        updated_at: serverTimestamp(),
      }, { merge: true });
    } catch (e) {
      console.error("Failed to update game state:", e);
    }
  };

  const initGame = () => {
    if (!user) return;
    const newState: GameState = {
      currentIndex: 0,
      choices: {},
      revealed: false,
      initiatorId: user.uid.toLowerCase(),
    };
    setGameState(newState);
    updateRemoteState(newState);
  };

  const handleSelect = async (option: "a" | "b") => {
    if (!gameState || !user || gameState.revealed || !coupleId) return;

    const myId = user.uid.toLowerCase();
    const pId = partnerId?.toLowerCase();

    const optimisticChoices = { ...gameState.choices, [myId]: option };

    // Check if both have answered
    const bothAnswered = !!(pId && optimisticChoices[pId]);

    const optimisticState = {
      ...gameState,
      choices: optimisticChoices,
      revealed: bothAnswered
    };

    setGameState(optimisticState);
    await updateRemoteState(optimisticState);
  };

  const nextQuestion = () => {
    if (!gameState || !user) return;
    const newState: GameState = {
      currentIndex: (gameState.currentIndex + 1) % questions.length,
      choices: {},
      revealed: false,
      initiatorId: user.uid.toLowerCase(),
    };
    setGameState(newState);
    updateRemoteState(newState);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-white/60 font-medium">Syncing game...</p>
      </div>
    );
  }

  if (!gameState) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onBack} className="text-white/90 bg-black/20 backdrop-blur-3xl saturate-150 border border-white/10 hover:bg-black/40 hover:text-white rounded-full shadow-lg transition-all duration-300">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-3xl font-serif font-bold text-white flex items-center gap-2 text-glow-gold">
            <MessageCircle className="h-6 w-6 text-blue-400 animate-pulse" />
            Would You Rather
          </h1>
        </div>
        <div className="glass-card p-10 text-center space-y-6">
          <Sparkles className="h-12 w-12 text-blue-300 mx-auto animate-pulse" />
          <h2 className="text-2xl font-serif font-bold text-white">Online Synchronous Play</h2>
          <p className="text-white/60 max-w-md mx-auto">
            Discover each other's preferences in real-time. Choices are hidden until both of you have answered!
          </p>
          <Button onClick={initGame} className="btn-rosy rounded-full px-10 py-6 text-lg font-bold shadow-xl">
            Play with Partner
          </Button>
        </div>
      </div>
    );
  }

  const myId = user?.uid.toLowerCase();
  const pId = partnerId?.toLowerCase();
  const myChoice = myId ? (gameState.choices[myId] || null) : null;
  const partnersChoice = pId ? (gameState.choices[pId] || null) : null;
  const isMatch = myChoice && partnersChoice && myChoice === partnersChoice;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={onBack} className="text-white/90 bg-black/20 backdrop-blur-3xl saturate-150 border border-white/10 hover:bg-black/40 hover:text-white rounded-full shadow-lg transition-all duration-300">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-3xl font-serif font-bold text-white flex items-center gap-2 text-glow-gold">
            <MessageCircle className="h-6 w-6 text-blue-400 animate-pulse" />
            Would You Rather
          </h1>
          <p className="text-white/60 tracking-wide font-medium">Discover how alike you really are!</p>
        </div>
      </div>

      <div className="glass-card p-6 md:p-10 min-h-[500px] flex flex-col justify-center relative overflow-hidden">
        <div className="absolute top-0 right-0 p-32 bg-blue-500/10 blur-[100px] rounded-full pointer-events-none" />
        <div className="absolute bottom-0 left-0 p-24 bg-purple-500/10 blur-[80px] rounded-full pointer-events-none" />

        <div className="relative z-10 max-w-2xl mx-auto w-full">
          <div className="text-center mb-8 space-y-2">
            <h2 className="text-2xl font-serif font-bold text-white text-glow-white">
              {!myChoice
                ? "Make your choice"
                : !gameState.revealed
                  ? "Waiting for partner..."
                  : isMatch
                    ? "You both think alike! "
                    : "Interesting difference! 🤔"}
            </h2>
            <p className="text-xs uppercase tracking-[0.2em] font-bold text-white/40">
              Question {gameState.currentIndex + 1} of {questions.length}
            </p>
          </div>

          <div className="space-y-8">
            <div className="text-center">
              <span className="text-lg font-medium text-white/80 italic">Would you rather...</span>
            </div>

            <div className="grid gap-6">
              <Button
                variant="outline"
                className={`h-auto py-8 px-6 text-left whitespace-normal transition-all duration-300 rounded-3xl border-2 group relative overflow-hidden ${gameState.revealed && myChoice === "a"
                  ? "border-primary bg-primary/20 text-white "
                  : gameState.revealed && partnersChoice === "a"
                    ? "border-blue-400 bg-blue-500/20 text-white shadow-[0_0_20px_rgba(96,165,250,0.3)]"
                    : myChoice === "a" && !gameState.revealed
                      ? "border-primary/50 bg-primary/10 text-white/90"
                      : "bg-white/5 border-white/10 text-white/90 hover:bg-white/10 hover:border-white/30 hover:scale-[1.02]"
                  }`}
                onClick={() => handleSelect("a")}
                disabled={!!myChoice}
              >
                <span className={`text-xl md:text-2xl font-serif transition-colors ${myChoice === "a" ? "text-white" : "text-white/90 group-hover:text-white"}`}>
                  {questions[gameState.currentIndex].a}
                </span>

                {myChoice === "a" && (
                  <div className="absolute top-4 right-4 bg-primary text-white text-[10px] font-bold px-3 py-1 rounded-full shadow-lg border border-white/20">
                    You
                  </div>
                )}
                {gameState.revealed && partnersChoice === "a" && (
                  <div className={`absolute top-4 ${myChoice === "a" ? 'right-16' : 'right-4'} bg-blue-500 text-white text-[10px] font-bold px-3 py-1 rounded-full shadow-lg border border-white/20`}>
                    Partner
                  </div>
                )}
              </Button>

              <div className="flex items-center justify-center">
                <div className="h-px bg-white/10 w-full" />
                <span className="px-4 text-amber-200/80 font-bold tracking-widest text-sm text-glow-gold">OR</span>
                <div className="h-px bg-white/10 w-full" />
              </div>

              <Button
                variant="outline"
                className={`h-auto py-8 px-6 text-left whitespace-normal transition-all duration-300 rounded-3xl border-2 group relative overflow-hidden ${gameState.revealed && myChoice === "b"
                  ? "border-primary bg-primary/20 text-white "
                  : gameState.revealed && partnersChoice === "b"
                    ? "border-blue-400 bg-blue-500/20 text-white shadow-[0_0_20px_rgba(96,165,250,0.3)]"
                    : myChoice === "b" && !gameState.revealed
                      ? "border-primary/50 bg-primary/10 text-white/90"
                      : "bg-white/5 border-white/10 text-white/90 hover:bg-white/10 hover:border-white/30 hover:scale-[1.02]"
                  }`}
                onClick={() => handleSelect("b")}
                disabled={!!myChoice}
              >
                <span className={`text-xl md:text-2xl font-serif transition-colors ${myChoice === "b" ? "text-white" : "text-white/90 group-hover:text-white"}`}>
                  {questions[gameState.currentIndex].b}
                </span>

                {myChoice === "b" && (
                  <div className="absolute top-4 right-4 bg-primary text-white text-[10px] font-bold px-3 py-1 rounded-full shadow-lg border border-white/20">
                    You
                  </div>
                )}
                {gameState.revealed && partnersChoice === "b" && (
                  <div className={`absolute top-4 ${myChoice === "b" ? 'right-16' : 'right-4'} bg-blue-500 text-white text-[10px] font-bold px-3 py-1 rounded-full shadow-lg border border-white/20`}>
                    Partner
                  </div>
                )}
              </Button>
            </div>

            {gameState.revealed && (
              <div className="text-center pt-8 animate-in fade-in slide-in-from-bottom-2">
                <Button onClick={nextQuestion} className="gap-2 btn-rosy rounded-full px-8 py-6 text-lg font-bold hover:scale-105 transition-transform shadow-xl">
                  <RefreshCw className="h-5 w-5" />
                  Next Question
                </Button>
              </div>
            )}

            {!gameState.revealed && myChoice && (
              <div className="flex items-center justify-center gap-2 text-white/40 animate-pulse mt-8">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-xs font-bold uppercase tracking-widest">Waiting for partner's choice...</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
