"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Heart, Check, X, Trophy, Loader2, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { db, auth } from "@/lib/firebase/client";
import { doc, setDoc, onSnapshot, serverTimestamp } from "firebase/firestore";
import { useOrbitStore } from "@/lib/store/global-store";

interface LoveQuizProps {
  onBack: () => void;
}

const quizQuestions = [
  "What is my favorite color?",
  "What is my go-to comfort food?",
  "What is my biggest fear?",
  "What is my dream vacation destination?",
  "What makes me laugh the most?",
  "What is my favorite movie genre?",
  "What is my most treasured possession?",
  "What is my favorite way to relax?",
  "What is my love language?",
  "What do I value most in our relationship?",
  "What is my favorite season?",
  "What is my hidden talent?",
  "What was my childhood dream job?",
  "What is my favorite thing about you?",
  "What is my pet peeve?",
];

type Phase = "setup" | "playing" | "reveal" | "complete";

interface Answer {
  question: string;
  playerAnswer: string;
  partnerAnswer: string;
  isCorrect?: boolean;
}

interface GameState {
  phase: Phase;
  currentQuestionIndex: number;
  answers: Answer[];
  selectedQuestions: string[];
  score: number;
  initiatorId: string;
  roundStep: "answering" | "guessing" | "revealing";
}

export function LoveQuiz({ onBack }: LoveQuizProps) {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [currentInput, setCurrentInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [isMyTurn, setIsMyTurn] = useState(false);

  const { toast } = useToast();
  const orbitStore = useOrbitStore();
  const user = auth.currentUser;
  const coupleId = orbitStore.couple?.id || orbitStore.profile?.couple_id;

  useEffect(() => {
    if (!coupleId || !user) {
      setLoading(false);
      return;
    }

    const gameRef = doc(db, "couples", coupleId, "game_sessions", "love-quiz");
    const unsubscribe = onSnapshot(gameRef, (doc) => {
      if (doc.exists()) {
        const data = doc.data();
        const state = data.state as GameState;
        setGameState(state);
        updateTurnStatus(state, user.uid);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [coupleId, user]);

  const updateTurnStatus = (state: GameState, userId: string) => {
    if (!userId) return;
    const isInitiator = state.initiatorId?.toLowerCase() === userId.toLowerCase();
    if (state.phase === "complete") {
      setIsMyTurn(false);
      return;
    }

    if (state.roundStep === "answering") {
      setIsMyTurn(isInitiator);
    } else if (state.roundStep === "guessing") {
      setIsMyTurn(!isInitiator);
    } else if (state.roundStep === "revealing") {
      setIsMyTurn(isInitiator);
    }
  };

  const updateRemoteState = async (newState: GameState) => {
    if (!coupleId) return;
    const gameRef = doc(db, "couples", coupleId, "game_sessions", "love-quiz");
    try {
      await setDoc(gameRef, {
        game_type: "love-quiz",
        state: newState,
        updated_at: serverTimestamp(),
      }, { merge: true });
    } catch (e) {
      console.error("Failed to update game state:", e);
    }
  };

  const startGame = () => {
    if (!user) return;
    const shuffled = [...quizQuestions].sort(() => Math.random() - 0.5);
    const newState: GameState = {
      phase: "playing",
      currentQuestionIndex: 0,
      answers: [],
      selectedQuestions: shuffled.slice(0, 5),
      score: 0,
      initiatorId: user.uid.toLowerCase(),
      roundStep: "answering",
    };
    setGameState(newState);
    updateRemoteState(newState);
  };

  const submitAnswer = async () => {
    if (!currentInput.trim() || !gameState || !coupleId) return;

    let newState = { ...gameState };

    if (gameState.roundStep === "answering") {
      newState.answers = [
        ...gameState.answers,
        {
          question: gameState.selectedQuestions[gameState.currentQuestionIndex],
          playerAnswer: currentInput.trim(),
          partnerAnswer: "",
        },
      ];
      newState.roundStep = "guessing";
    } else if (gameState.roundStep === "guessing") {
      const updatedAnswers = [...gameState.answers];
      updatedAnswers[gameState.currentQuestionIndex] = {
        ...updatedAnswers[gameState.currentQuestionIndex],
        partnerAnswer: currentInput.trim(),
      };
      newState.answers = updatedAnswers;
      newState.phase = "reveal";
      newState.roundStep = "revealing";
    }

    setCurrentInput("");
    setGameState(newState);
    await updateRemoteState(newState);
  };

  const handleReveal = (isCorrect: boolean) => {
    if (!gameState) return;

    let newState = { ...gameState };
    if (isCorrect) {
      newState.score += 1;
    }

    const updatedAnswers = [...gameState.answers];
    updatedAnswers[gameState.currentQuestionIndex] = {
      ...updatedAnswers[gameState.currentQuestionIndex],
      isCorrect,
    };
    newState.answers = updatedAnswers;

    if (gameState.currentQuestionIndex < gameState.selectedQuestions.length - 1) {
      newState.currentQuestionIndex += 1;
      newState.phase = "playing";
      newState.roundStep = "answering";
    } else {
      newState.phase = "complete";
    }

    setGameState(newState);
    updateRemoteState(newState);
  };

  const restartGame = () => {
    startGame();
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-white/60 font-medium">Loading game session...</p>
      </div>
    );
  }

  if (!gameState || gameState.phase === "setup") {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onBack} className="text-white/90 bg-black/20 backdrop-blur-3xl saturate-150 border border-white/10 hover:bg-black/40 hover:text-white rounded-full shadow-lg transition-all duration-300">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-serif font-bold text-white flex items-center gap-2 text-glow-gold">
              <Heart className="h-6 w-6 text-rose-400 animate-pulse" />
              Love Quiz
            </h1>
            <p className="text-white/60 tracking-wide font-medium">Test how well you know each other!</p>
          </div>
        </div>

        <div className="glass-card p-6 md:p-10 min-h-[400px] flex flex-col justify-center relative overflow-hidden">
          <div className="absolute top-0 right-0 p-32 bg-rose-500/10 blur-[100px] rounded-full pointer-events-none" />
          <div className="absolute bottom-0 left-0 p-24 bg-purple-500/10 blur-[80px] rounded-full pointer-events-none" />

          <div className="relative z-10 max-w-xl mx-auto w-full text-center space-y-8">
            <h2 className="text-2xl font-serif font-bold text-white text-glow-white mb-2">How to Play Online</h2>

            <div className="space-y-4 text-left bg-white/5 p-6 rounded-2xl border border-white/10">
              <div className="flex gap-4 items-start">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-rose-500/20 text-rose-300 flex items-center justify-center text-sm font-bold">1</span>
                <p className="text-white/80 leading-relaxed font-medium">You answer a question about yourself.</p>
              </div>
              <div className="flex gap-4 items-start">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-rose-500/20 text-rose-300 flex items-center justify-center text-sm font-bold">2</span>
                <p className="text-white/80 leading-relaxed font-medium">Your partner tries to guess your answer on their screen.</p>
              </div>
              <div className="flex gap-4 items-start">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-rose-500/20 text-rose-300 flex items-center justify-center text-sm font-bold">3</span>
                <p className="text-white/80 leading-relaxed font-medium">You reveal if they were right. It's that simple!</p>
              </div>
            </div>

            <Button onClick={startGame} className="w-full btn-rosy rounded-full py-6 text-lg font-bold shadow-lg hover:scale-105 transition-transform">
              Start Online Session
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (gameState.phase === "playing") {
    const isSubject = gameState.initiatorId?.toLowerCase() === user?.uid.toLowerCase();
    const isAnswering = gameState.roundStep === "answering";

    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onBack} className="text-white/90 bg-black/20 backdrop-blur-3xl saturate-150 border border-white/10 hover:bg-black/40 hover:text-white rounded-full shadow-lg transition-all duration-300">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-serif font-bold text-white flex items-center gap-2 text-glow-gold">
              <Heart className="h-6 w-6 text-rose-400 animate-pulse" />
              Love Quiz
            </h1>
            <p className="text-white/60 tracking-wide font-medium">
              Question {gameState.currentQuestionIndex + 1} of {gameState.selectedQuestions.length}
            </p>
          </div>
        </div>

        <div className="glass-card p-6 md:p-10 min-h-[400px] flex flex-col justify-center relative overflow-hidden">
          <div className="relative z-10 max-w-xl mx-auto w-full space-y-8">
            <div className="text-center space-y-2">
              <h2 className="text-xl font-bold text-white/90 uppercase tracking-widest flex items-center justify-center gap-2">
                {isMyTurn ? (
                  <span className="flex items-center gap-2 text-rose-400">
                    <Sparkles className="h-5 w-5 fill-rose-400" />
                    It's Your Turn!
                  </span>
                ) : (
                  <span className="text-white/40 italic">Waiting for partner...</span>
                )}
              </h2>
              <p className="text-sm text-white/50 font-bold uppercase tracking-[0.2em] mt-2">
                {isAnswering ? (isSubject ? "Tell them about yourself" : "Partner is writing...") : (isSubject ? "Partner is guessing..." : "What's their answer?")}
              </p>
            </div>

            <div className="bg-white/10 backdrop-blur-md rounded-2xl p-8 text-center border border-white/10 shadow-inner">
              <p className="text-2xl md:text-3xl font-serif font-medium text-white text-glow-white leading-relaxed">
                {gameState.selectedQuestions[gameState.currentQuestionIndex]}
              </p>
            </div>

            <div className="flex flex-col gap-4">
              <div className="flex flex-col sm:flex-row gap-3">
                <Input
                  value={currentInput}
                  onChange={(e) => setCurrentInput(e.target.value)}
                  placeholder={isMyTurn ? (isAnswering ? "Your answer..." : "Your guess...") : "Waiting..."}
                  onKeyDown={(e) => e.key === "Enter" && isMyTurn && submitAnswer()}
                  disabled={!isMyTurn}
                  className="bg-black/20 border-white/20 text-white placeholder:text-white/30 h-14 rounded-xl focus-visible:ring-rose-400/50"
                />
                <Button
                  onClick={submitAnswer}
                  disabled={!currentInput.trim() || !isMyTurn}
                  className="h-14 px-8 btn-rosy rounded-xl font-bold shadow-lg"
                >
                  Submit
                </Button>
              </div>
              {!isMyTurn && (
                <div className="flex items-center justify-center gap-2 text-white/40 animate-pulse">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-xs font-bold uppercase tracking-widest">Live Syncing...</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (gameState.phase === "reveal") {
    const currentAnswer = gameState.answers[gameState.currentQuestionIndex];
    const isSubject = gameState.initiatorId?.toLowerCase() === user?.uid.toLowerCase();

    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onBack} className="text-white/90 bg-black/20 backdrop-blur-3xl saturate-150 border border-white/10 hover:bg-black/40 hover:text-white rounded-full shadow-lg transition-all duration-300">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-serif font-bold text-white flex items-center gap-2 text-glow-gold">
              <Heart className="h-6 w-6 text-rose-400 animate-pulse" />
              Love Quiz
            </h1>
            <p className="text-white/60 tracking-wide font-medium">Time to reveal!</p>
          </div>
        </div>

        <div className="glass-card p-6 md:p-10 min-h-[400px] flex flex-col justify-center relative overflow-hidden">
          <div className="relative z-10 max-w-xl mx-auto w-full space-y-8">
            <h2 className="text-xl font-bold text-white/90 text-center uppercase tracking-widest">
              {isSubject ? "Did them get it right?" : "Waiting for partner to reveal..."}
            </h2>

            <div className="bg-white/5 backdrop-blur-md rounded-2xl p-6 text-center border border-white/10">
              <p className="text-xl font-serif text-white">{currentAnswer.question}</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="bg-rose-500/10 rounded-2xl p-6 border border-rose-500/20">
                <p className="text-[10px] uppercase tracking-widest text-rose-300 mb-2 font-bold">Your partner's answer</p>
                <p className="font-medium text-white text-lg">{isSubject ? currentAnswer.playerAnswer : "???"}</p>
                {!isSubject && <span className="text-[10px] italic text-rose-300/40">Visible after reveal</span>}
              </div>
              <div className="bg-blue-500/10 rounded-2xl p-6 border border-blue-500/20">
                <p className="text-[10px] uppercase tracking-widest text-blue-300 mb-2 font-bold">The guess</p>
                <p className="font-medium text-white text-lg">{currentAnswer.partnerAnswer}</p>
              </div>
            </div>

            {isSubject && (
              <div className="flex gap-4 justify-center pt-4">
                <Button
                  variant="outline"
                  className="gap-2 border-red-500/30 text-red-300 hover:bg-red-500/10 hover:border-red-500 hover:text-red-200 h-12 rounded-xl px-6 bg-transparent"
                  onClick={() => handleReveal(false)}
                >
                  <X className="h-4 w-4" />
                  Not Quite
                </Button>
                <Button
                  className="gap-2 h-12 rounded-xl px-8 btn-greenish font-bold shadow-lg shadow-green-900/20"
                  onClick={() => handleReveal(true)}
                >
                  <Check className="h-4 w-4" />
                  Close Enough!
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Complete phase
  const percentage = Math.round((gameState.score / gameState.selectedQuestions.length) * 100);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={onBack} className="text-white/90 bg-black/20 backdrop-blur-3xl saturate-150 border border-white/10 hover:bg-black/40 hover:text-white rounded-full shadow-lg transition-all duration-300">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-3xl font-serif font-bold text-white flex items-center gap-2 text-glow-gold">
            <Trophy className="h-6 w-6 text-yellow-400 animate-bounce" />
            Quiz Complete!
          </h1>
        </div>
      </div>

      <div className="glass-card p-10 text-center space-y-8 relative overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-gradient-to-b from-transparent via-primary/5 to-transparent pointer-events-none" />

        <div className="relative z-10">
          <div className="text-8xl font-black text-transparent bg-clip-text bg-gradient-to-br from-rose-300 via-white to-rose-200 drop-shadow-2xl mb-2">
            {gameState.score}/{gameState.selectedQuestions.length}
          </div>
          <p className="text-2xl font-serif text-white/90 italic">
            {percentage >= 80
              ? "Amazing! You really know each other!"
              : percentage >= 60
                ? "Great job! Keep learning about each other!"
                : percentage >= 40
                  ? "Not bad! There is always more to discover!"
                  : "Time to ask more questions!"}
          </p>

          <div className="space-y-3 max-w-md mx-auto mt-8">
            {gameState.answers.map((answer, index) => (
              <div
                key={index}
                className={`flex items-center gap-3 p-4 rounded-xl border backdrop-blur-sm transition-all text-left ${answer.isCorrect
                  ? "bg-green-500/10 border-green-500/30 shadow-[0_0_15px_rgba(34,197,94,0.1)]"
                  : "bg-red-500/10 border-red-500/30"
                  }`}
              >
                {answer.isCorrect ? (
                  <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center shrink-0">
                    <Check className="h-4 w-4 text-green-400" />
                  </div>
                ) : (
                  <div className="w-6 h-6 rounded-full bg-red-500/20 flex items-center justify-center shrink-0">
                    <X className="h-4 w-4 text-red-400" />
                  </div>
                )}
                <span className="text-sm font-medium text-white/80">{answer.question}</span>
              </div>
            ))}
          </div>

          <Button onClick={restartGame} className="mt-8 btn-rosy rounded-full px-10 py-6 text-lg font-bold shadow-xl hover:scale-105 transition-transform">
            Play Again
          </Button>
        </div>
      </div>
    </div>
  );
}
