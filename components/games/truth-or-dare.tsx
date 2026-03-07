"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Flame, RefreshCw, Sparkles, Heart, Zap, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { db, auth } from "@/lib/firebase/client";
import { doc, getDoc, setDoc, onSnapshot, serverTimestamp } from "firebase/firestore";
import { useOrbitStore } from "@/lib/store/global-store";

interface TruthOrDareProps {
  onBack: () => void;
}

type Category = "romantic" | "spicy" | "funny" | "deep";
type Mode = "truth" | "dare";

const truths: Record<Category, string[]> = {
  romantic: [
    "What was your first impression of me?",
    "What is your favorite memory of us together?",
    "What do you love most about our relationship?",
    "When did you first realize you loved me?",
    "What is something I do that always makes you smile?",
    "What is your favorite thing about the way I look?",
    "If we could relive any moment together, which would you choose?",
    "What is your favorite way to spend time with me?",
  ],
  spicy: [
    "What is your biggest fantasy involving us?",
    "What is the most attractive thing I do without realizing?",
    "Where is your favorite place for us to be intimate?",
    "What is something new you would like to try together?",
    "What outfit of mine drives you the craziest?",
    "What is your favorite way to be kissed?",
  ],
  funny: [
    "What is the most embarrassing thing you have done around me?",
    "If I was a food, what would I be and why?",
    "What is the weirdest dream you have had about me?",
    "What is something silly you do when I am not around?",
    "What is the funniest thing that has happened in our relationship?",
    "If we swapped bodies for a day, what would you do first?",
  ],
  deep: [
    "What are you most afraid of in our relationship?",
    "What do you think is our biggest strength as a couple?",
    "Where do you see us in 10 years?",
    "What is something you have never told me but want to?",
    "What lesson has our relationship taught you?",
    "How have I changed you as a person?",
  ],
};

const dares: Record<Category, string[]> = {
  romantic: [
    "Give me a 30-second kiss",
    "Write me a short love poem right now",
    "Slow dance with me for one song",
    "Tell me three things you love about me while looking into my eyes",
    "Give me a relaxing massage for 5 minutes",
    "Recreate our first kiss",
    "Send me a heartfelt voice message",
  ],
  spicy: [
    "Kiss my neck for 30 seconds",
    "Give me a lap dance",
    "Whisper something seductive in my ear",
    "Take off one piece of my clothing",
    "Show me your best seductive look",
    "Kiss me somewhere unexpected",
  ],
  funny: [
    "Do your best impression of me",
    "Serenade me with a made-up song",
    "Do a silly dance for 30 seconds",
    "Talk in an accent for the next 3 rounds",
    "Let me style your hair however I want",
    "Let me tickle you for 30 seconds",
  ],
  deep: [
    "Share your biggest dream for our future",
    "Tell me about a moment when you felt most loved by me",
    "Share something vulnerable you have never told me",
    "Describe our perfect day together in detail",
    "Tell me what you are most grateful for in our relationship",
  ],
};

const categories: { id: Category; label: string; icon: React.ReactNode; color: string }[] = [
  { id: "romantic", label: "Romantic", icon: <Heart className="h-4 w-4" />, color: "border-pink-500/30 text-pink-300" },
  { id: "spicy", label: "Spicy", icon: <Flame className="h-4 w-4" />, color: "border-orange-500/30 text-orange-300" },
  { id: "funny", label: "Funny", icon: <Sparkles className="h-4 w-4" />, color: "border-yellow-500/30 text-yellow-300" },
  { id: "deep", label: "Deep", icon: <Zap className="h-4 w-4" />, color: "border-blue-500/30 text-blue-300" },
];

interface GameState {
  category: Category;
  mode: Mode | null;
  currentPrompt: string | null;
  turnUserId: string;
  initiatorId: string;
}

export function TruthOrDare({ onBack }: TruthOrDareProps) {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const orbitStore = useOrbitStore();
  const user = auth.currentUser;
  const coupleId = orbitStore.couple?.id || orbitStore.profile?.couple_id;
  const user1Id = orbitStore.couple?.user1_id;
  const user2Id = orbitStore.couple?.user2_id;

  useEffect(() => {
    if (!coupleId || !user) {
      setLoading(false);
      return;
    }

    const gameRef = doc(db, "couples", coupleId, "game_sessions", "truth-or-dare");
    const unsubscribe = onSnapshot(gameRef, (doc) => {
      if (doc.exists()) {
        const data = doc.data();
        setGameState(data.state as GameState);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [coupleId, user]);

  const updateRemoteState = async (newState: GameState) => {
    if (!coupleId) return;
    const gameRef = doc(db, "couples", coupleId, "game_sessions", "truth-or-dare");
    try {
      await setDoc(gameRef, {
        game_type: "truth-or-dare",
        state: newState,
        updated_at: serverTimestamp(),
      }, { merge: true });
    } catch (e) {
      console.error("Failed to update game state:", e);
    }
  };

  const initGame = () => {
    if (!user) return;
    const newState: GameState = {
      category: "romantic",
      mode: null,
      currentPrompt: null,
      turnUserId: user.uid.toLowerCase(),
      initiatorId: user.uid.toLowerCase(),
    };
    setGameState(newState);
    updateRemoteState(newState);
  };

  const handleChoice = async (selectedMode: Mode) => {
    if (!gameState || user?.uid.toLowerCase() !== gameState.turnUserId?.toLowerCase() || !coupleId) return;

    const prompts = selectedMode === "truth" ? truths[gameState.category] : dares[gameState.category];
    const randomPrompt = prompts[Math.floor(Math.random() * prompts.length)];

    const newState: GameState = {
      ...gameState,
      mode: selectedMode,
      currentPrompt: randomPrompt,
    };
    setGameState(newState);
    await updateRemoteState(newState);
  };

  const handleNextRound = async () => {
    if (!gameState || !user1Id || !coupleId || !user2Id) return;

    const currentTurn = gameState.turnUserId?.toLowerCase();
    const nextTurnUserId = currentTurn === user1Id.toLowerCase() ? user2Id.toLowerCase() : user1Id.toLowerCase();

    const newState: GameState = {
      ...gameState,
      mode: null,
      currentPrompt: null,
      turnUserId: nextTurnUserId,
    };
    setGameState(newState);
    await updateRemoteState(newState);
  };

  const changeCategory = async (cat: Category) => {
    if (!gameState || user?.uid.toLowerCase() !== gameState.turnUserId.toLowerCase() || !coupleId) return;

    const newState: GameState = {
      ...gameState,
      category: cat,
      mode: null,
      currentPrompt: null,
    };
    setGameState(newState);
    await updateRemoteState(newState);
  };

  const isMyTurn = user?.uid.toLowerCase() === gameState?.turnUserId?.toLowerCase();

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-white/60 font-medium">Loading session...</p>
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
            <Flame className="h-6 w-6 text-amber-400 animate-pulse" />
            Truth or Dare
          </h1>
        </div>
        <div className="glass-card p-10 text-center space-y-6">
          <Sparkles className="h-12 w-12 text-blue-300 mx-auto animate-pulse" />
          <h2 className="text-2xl font-serif font-bold text-white">Online Multiplayer</h2>
          <p className="text-white/60 max-w-md mx-auto">
            Take turns and challenge each other in real-time. What you pick updates instantly for your partner!
          </p>
          <Button onClick={initGame} className="btn-rosy rounded-full px-10 py-6 text-lg font-bold shadow-xl">
            Start Session
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={onBack} className="text-white/90 bg-black/20 backdrop-blur-3xl saturate-150 border border-white/10 hover:bg-black/40 hover:text-white rounded-full shadow-lg transition-all duration-300">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-3xl font-serif font-bold text-white flex items-center gap-2 text-glow-gold">
            <Flame className="h-6 w-6 text-amber-400 animate-pulse" />
            Truth or Dare
          </h1>
          <p className="text-white/60 tracking-wide font-medium flex items-center gap-2">
            {isMyTurn ? (
              <span className="text-rose-400 flex items-center gap-1 font-bold">
                <Sparkles className="h-4 w-4" />
                Your Turn to Choose!
              </span>
            ) : (
              <span className="italic">Partner's Turn...</span>
            )}
          </p>
        </div>
      </div>

      {/* Category Selection */}
      <div className="flex flex-wrap gap-3">
        {categories.map((cat) => (
          <div
            key={cat.id}
            onClick={() => isMyTurn && changeCategory(cat.id)}
            className={`
              cursor-pointer px-4 py-2 rounded-full border transition-all duration-300 flex items-center gap-2
              ${gameState.category === cat.id
                ? "bg-white/20 border-white/40 text-white shadow-[0_0_15px_rgba(255,255,255,0.3)] scale-105"
                : "bg-black/20 border-white/10 text-white/50 hover:bg-white/10 hover:scale-105 hover:text-white"
              }
              ${!isMyTurn ? "opacity-50 cursor-not-allowed" : ""}
            `}
          >
            {cat.icon}
            <span className="font-bold text-sm tracking-wide">{cat.label}</span>
          </div>
        ))}
      </div>

      {/* Game Area */}
      <div className="glass-card p-8 min-h-[400px] flex flex-col justify-center relative overflow-hidden">
        <div className="absolute top-0 right-0 p-32 bg-primary/10 blur-[100px] rounded-full pointer-events-none" />

        <div className="text-center space-y-8 relative z-10">
          <h2 className="text-2xl font-serif font-bold text-white text-glow-white mb-6">
            {!gameState.mode ? (isMyTurn ? "Make Your Choice" : "Waiting for partner...") : gameState.mode === "truth" ? "Answer Truthfully" : "Complete the Dare"}
          </h2>

          {!gameState.mode ? (
            <div className={`flex flex-col sm:flex-row gap-6 justify-center ${!isMyTurn ? 'opacity-30 grayscale pointer-events-none' : ''}`}>
              <Button
                className="h-40 w-40 flex-col gap-4 rounded-[2rem] border-2 border-white/10 bg-black/40 hover:bg-black/60 hover:scale-105 hover:border-blue-400/50 hover:shadow-[0_0_30px_rgba(59,130,246,0.3)] transition-all duration-300 group"
                onClick={() => handleChoice("truth")}
              >
                <div className="w-16 h-16 rounded-full bg-blue-500/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <span className="text-4xl">🤔</span>
                </div>
                <span className="font-bold text-xl text-blue-200 tracking-widest uppercase">Truth</span>
              </Button>

              <Button
                className="h-40 w-40 flex-col gap-4 rounded-[2rem] border-2 border-white/10 bg-black/40 hover:bg-black/60 hover:scale-105 hover:border-orange-400/50 hover:shadow-[0_0_30px_rgba(249,115,22,0.3)] transition-all duration-300 group"
                onClick={() => handleChoice("dare")}
              >
                <div className="w-16 h-16 rounded-full bg-orange-500/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <span className="text-4xl text-orange-500">🔥</span>
                </div>
                <span className="font-bold text-xl text-orange-200 tracking-widest uppercase">Dare</span>
              </Button>
            </div>
          ) : (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="p-8 rounded-[2rem] bg-white/5 border border-white/10 backdrop-blur-sm min-h-[160px] flex items-center justify-center shadow-inner">
                <p className="text-2xl md:text-3xl font-medium leading-relaxed text-white text-glow-white">
                  {gameState.currentPrompt}
                </p>
              </div>

              <div className="flex flex-wrap gap-4 justify-center">
                <Button
                  onClick={handleNextRound}
                  className="rounded-full px-8 py-6 text-white border-white/20 hover:bg-white/10 hover:border-white/40 transition-all font-bold tracking-wide"
                >
                  Skip turn
                </Button>
                <Button
                  onClick={handleNextRound}
                  className="rounded-full px-8 py-6 gap-2 btn-rosy font-bold tracking-wide shadow-lg hover:scale-105 transition-all"
                >
                  <RefreshCw className="h-4 w-4" />
                  Task Completed!
                </Button>
              </div>
            </div>
          )}

          {!isMyTurn && !gameState.mode && (
            <div className="flex items-center justify-center gap-2 text-white/40 animate-pulse mt-8">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-xs font-bold uppercase tracking-widest">Partner is deciding...</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
