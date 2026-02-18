"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";

// All crypto currency words, 4-6 letters only
const VALID_WORDS = [
  "algo", "atom", "avax", "cake", "celo", "dash", "doge", "flow",
  "gala", "hbar", "iota", "kava", "link", "luna", "mana", "near",
  "sand", "shib", "tron", "aave", "bonk", "comp", "rune", "mina",
  "ocean", "osmo", "pepe", "matic", "sushi", "tezos", "theta",
  "aptos", "kaspa", "fetch", "ondo", "pyth", "axie", "polyx",
  "nano", "qtum", "coti", "iotx", "waxp", "klay", "egld",
  "celo", "flux", "velo", "ankr", "arpa", "band", "bake",
  "reef", "rose", "scrt", "storj", "steem", "tfuel",
  "audio", "bico",
].filter((w) => w.length >= 4 && w.length <= 6);

const TRICK_WORD = "six";
const TRICK_ANSWER = "steven";
const INITIAL_TIME = 4500;
const TIME_DECREASE = 200;
const MIN_TIME = 1200;
const MAX_LIVES = 3;
const TRICK_CHANCE = 0.2;

type GameScreen = "home" | "playing" | "gameover";

interface Particle {
  id: number;
  x: number;
  y: number;
  angle: number;
  speed: number;
  color: string;
  size: number;
}

function getRandomWord() {
  if (Math.random() < TRICK_CHANCE) return TRICK_WORD;
  return VALID_WORDS[Math.floor(Math.random() * VALID_WORDS.length)];
}

function getTimeDuration(score: number) {
  return Math.max(MIN_TIME, INITIAL_TIME - score * TIME_DECREASE);
}

const PARTICLE_COLORS = ["#4ade80", "#22c55e", "#86efac", "#f5c542", "#fbbf24", "#a3e635"];

export default function Home() {
  const [screen, setScreen] = useState<GameScreen>("home");
  const [word, setWord] = useState("");
  const [input, setInput] = useState("");
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(MAX_LIVES);
  const [highScore, setHighScore] = useState(0);
  const [progress, setProgress] = useState(1);
  const [shaking, setShaking] = useState(false);

  // Hit animation states
  const [flashing, setFlashing] = useState(false);
  const [scorePop, setScorePop] = useState(false);
  const [floats, setFloats] = useState<{ id: number; text: string }[]>([]);
  const [wordSlam, setWordSlam] = useState(false);
  const [particles, setParticles] = useState<Particle[]>([]);
  const [streak, setStreak] = useState(0);
  const [screenPulse, setScreenPulse] = useState(false);
  const [showCombo, setShowCombo] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef(0);
  const durationRef = useRef(INITIAL_TIME);
  const scoreRef = useRef(0);
  const livesRef = useRef(MAX_LIVES);
  const streakRef = useRef(0);
  const floatIdRef = useRef(0);
  const particleIdRef = useRef(0);

  scoreRef.current = score;
  livesRef.current = lives;
  streakRef.current = streak;

  useEffect(() => {
    loadHighScore();
  }, []);

  async function loadHighScore() {
    try {
      if (supabase) {
        const { data } = await supabase
          .from("high_scores")
          .select("score")
          .order("score", { ascending: false })
          .limit(1)
          .single();
        if (data) {
          setHighScore(data.score);
          return;
        }
      }
    } catch {
      // fall through to localStorage
    }
    const saved = localStorage.getItem("typeSixStevenHighScore");
    if (saved) setHighScore(parseInt(saved, 10));
  }

  const saveHighScore = useCallback(async (newScore: number) => {
    setHighScore((prev) => {
      const best = Math.max(prev, newScore);
      localStorage.setItem("typeSixStevenHighScore", String(best));
      return best;
    });
    try {
      if (supabase) {
        await supabase.from("high_scores").insert({ score: newScore });
      }
    } catch {
      // localStorage fallback already saved above
    }
  }, []);

  const stopTimer = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const shake = useCallback(() => {
    setShaking(true);
    setTimeout(() => setShaking(false), 500);
  }, []);

  // ===== HIT EFFECTS =====
  const spawnParticles = useCallback(() => {
    const newParticles: Particle[] = [];
    const count = 12 + Math.min(streakRef.current * 3, 20);
    for (let i = 0; i < count; i++) {
      newParticles.push({
        id: particleIdRef.current++,
        x: 0,
        y: 0,
        angle: (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5,
        speed: 60 + Math.random() * 120,
        color: PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)],
        size: 4 + Math.random() * 6,
      });
    }
    setParticles(newParticles);
    setTimeout(() => setParticles([]), 700);
  }, []);

  const triggerHitEffects = useCallback(
    (newStreak: number) => {
      // Green flash
      setFlashing(true);
      setTimeout(() => setFlashing(false), 400);

      // Score bounce
      setScorePop(true);
      setTimeout(() => setScorePop(false), 500);

      // Floating "+1" (or "+streak" for combos)
      const floatText = newStreak >= 3 ? `+${newStreak}` : "+1";
      const id = floatIdRef.current++;
      setFloats((prev) => [...prev, { id, text: floatText }]);
      setTimeout(() => setFloats((prev) => prev.filter((f) => f.id !== id)), 800);

      // Word slam animation
      setWordSlam(true);
      setTimeout(() => setWordSlam(false), 350);

      // Particles
      spawnParticles();

      // Screen pulse on streak >= 3
      if (newStreak >= 3) {
        setScreenPulse(true);
        setTimeout(() => setScreenPulse(false), 600);
        setShowCombo(true);
        setTimeout(() => setShowCombo(false), 800);
      }
    },
    [spawnParticles]
  );

  const nextRound = useCallback(
    (newScore: number, delay = 100) => {
      const w = getRandomWord();
      setWord(w);
      setInput("");
      const dur = getTimeDuration(newScore);
      durationRef.current = dur;

      setTimeout(() => {
        setProgress(1);
        startRef.current = Date.now();

        requestAnimationFrame(() => {
          const tick = () => {
            const elapsed = Date.now() - startRef.current;
            const remaining = Math.max(0, dur - elapsed);
            setProgress(remaining / dur);
            if (remaining > 0) {
              rafRef.current = requestAnimationFrame(tick);
            }
          };
          rafRef.current = requestAnimationFrame(tick);
        });

        timeoutRef.current = setTimeout(() => {
          stopTimer();
          setProgress(0);
          setStreak(0);
          streakRef.current = 0;
          const curLives = livesRef.current - 1;
          setLives(curLives);
          if (curLives <= 0) {
            saveHighScore(scoreRef.current);
            setScreen("gameover");
          } else {
            shake();
            nextRound(scoreRef.current, 300);
          }
        }, dur);

        inputRef.current?.focus();
      }, delay);
    },
    [stopTimer, shake, saveHighScore]
  );

  const startGame = useCallback(() => {
    setScreen("playing");
    setScore(0);
    setLives(MAX_LIVES);
    setStreak(0);
    scoreRef.current = 0;
    livesRef.current = MAX_LIVES;
    streakRef.current = 0;
    setInput("");
    setParticles([]);
    setFloats([]);
    nextRound(0);
  }, [nextRound]);

  const handleSubmit = useCallback(() => {
    const trimmed = input.trim().toLowerCase();
    if (!trimmed) return;

    const isTrick = word === TRICK_WORD;
    const expected = isTrick ? TRICK_ANSWER : word.toLowerCase();

    stopTimer();

    if (trimmed === expected) {
      const newScore = scoreRef.current + 1;
      const newStreak = streakRef.current + 1;
      setScore(newScore);
      setStreak(newStreak);
      scoreRef.current = newScore;
      streakRef.current = newStreak;

      triggerHitEffects(newStreak);
      nextRound(newScore);
    } else {
      shake();
      setStreak(0);
      streakRef.current = 0;
      const newLives = livesRef.current - 1;
      setLives(newLives);
      livesRef.current = newLives;
      if (newLives <= 0) {
        saveHighScore(scoreRef.current);
        setScreen("gameover");
      } else {
        nextRound(scoreRef.current, 300);
      }
    }
  }, [input, word, stopTimer, nextRound, shake, saveHighScore, triggerHitEffects]);

  useEffect(() => {
    return () => stopTimer();
  }, [stopTimer]);

  useEffect(() => {
    if (screen === "gameover") saveHighScore(score);
  }, [screen, score, saveHighScore]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSubmit();
  };

  // =================== HOME ===================
  if (screen === "home") {
    return (
      <div className="min-h-screen bg-[#1a1d23] flex items-center justify-center">
        <div className="text-center max-w-lg mx-auto px-6">
          <h1 className="mb-6">
            <span className="text-5xl md:text-6xl font-bold text-white">Type </span>
            <span className="text-5xl md:text-6xl font-bold text-[#e85d5d] italic line-through">Six</span>
            <br />
            <span className="text-5xl md:text-6xl font-bold text-[#4ade80]">Steven</span>
          </h1>

          <p className="text-gray-400 text-lg mb-6">
            Type the word before time runs out. But when you see{" "}
            <span className="text-[#e85d5d] font-bold">&quot;six&quot;</span>, type{" "}
            <span className="text-[#4ade80] font-bold">&quot;steven&quot;</span> instead!
          </p>

          <div className="text-gray-400 text-base space-y-1 mb-8">
            <p>&#x23F1;&#xFE0F; Timer gets faster each word</p>
            <p>&#x2764;&#xFE0F; 3 lives &mdash; don&apos;t lose them all</p>
            <p>&#x26A1; Watch out for the trick!</p>
          </div>

          {highScore > 0 && (
            <p className="text-[#f5c542] text-xl font-bold mb-6">
              &#x1F3C6; High Score: {highScore}
            </p>
          )}

          <button
            onClick={startGame}
            className="bg-[#4ade80] hover:bg-[#22c55e] text-[#1a1d23] font-bold text-xl px-16 py-4 rounded-xl transition-colors cursor-pointer"
          >
            Start Game
          </button>
        </div>
      </div>
    );
  }

  // =================== GAME OVER ===================
  if (screen === "gameover") {
    return (
      <div className="min-h-screen bg-[#1a1d23] flex items-center justify-center">
        <div className="text-center max-w-lg mx-auto px-6">
          <h1 className="text-5xl md:text-7xl font-extrabold text-[#e05555] mb-4 uppercase tracking-tight">Game Over</h1>

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://media1.tenor.com/m/UzpS0uUy60QAAAAC/typing-on-the-keyboard-bob-pinciotti.gif"
            alt="Game over meme"
            className="mx-auto mb-6 rounded-xl max-w-[280px] w-full"
          />

          <p className="text-gray-400 text-2xl mb-2">Your score</p>
          <p className="text-[#4ade80] text-7xl font-bold mb-6">{score}</p>

          {score >= highScore && score > 0 && (
            <p className="text-[#f5c542] text-xl font-bold mb-4">&#x1F389; New High Score!</p>
          )}

          {highScore > 0 && (
            <p className="text-gray-400 text-lg mb-8">&#x1F3C6; Best: {Math.max(highScore, score)}</p>
          )}

          <button
            onClick={startGame}
            className="bg-[#4ade80] hover:bg-[#22c55e] text-[#1a1d23] font-bold text-xl px-16 py-4 rounded-xl transition-colors cursor-pointer"
          >
            Play Again
          </button>
        </div>
      </div>
    );
  }

  // =================== PLAYING ===================
  const isTrick = word === TRICK_WORD;

  return (
    <div
      className={`min-h-screen bg-[#1a1d23] flex items-center justify-center relative overflow-hidden ${
        screenPulse ? "animate-screen-pulse" : ""
      }`}
    >
      {/* Green flash overlay */}
      {flashing && (
        <div className="absolute inset-0 bg-[#4ade80] animate-flash pointer-events-none z-50" />
      )}

      {/* Particle burst from center */}
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute pointer-events-none z-40 rounded-full"
          style={{
            left: "50%",
            top: "40%",
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
            animation: `particle 0.6s ease-out forwards`,
            transform: `translate(${Math.cos(p.angle) * p.speed}px, ${
              Math.sin(p.angle) * p.speed
            }px) scale(0)`,
            transition: "transform 0.6s cubic-bezier(0, 0.7, 0.3, 1), opacity 0.6s ease-out",
            opacity: 0,
          }}
          ref={(el) => {
            if (el) {
              requestAnimationFrame(() => {
                el.style.transform = `translate(${Math.cos(p.angle) * p.speed}px, ${
                  Math.sin(p.angle) * p.speed
                }px) scale(1)`;
                el.style.opacity = "1";
                setTimeout(() => {
                  el.style.transform = `translate(${Math.cos(p.angle) * p.speed * 2.5}px, ${
                    Math.sin(p.angle) * p.speed * 2.5
                  }px) scale(0)`;
                  el.style.opacity = "0";
                }, 50);
              });
            }
          }}
        />
      ))}

      <div className="text-center w-full max-w-2xl mx-auto px-6 relative z-10">
        {/* Score + floating text */}
        <div className="mb-4 relative inline-block">
          <span className="text-gray-400 text-lg">Score: </span>
          <span
            className={`text-white text-lg font-bold inline-block ${
              scorePop ? "animate-score-pop" : ""
            }`}
          >
            {score}
          </span>

          {/* Floating +1 / +streak */}
          {floats.map((f) => (
            <span
              key={f.id}
              className="absolute -top-2 left-full ml-2 text-[#4ade80] font-bold text-xl animate-float-up pointer-events-none"
            >
              {f.text}
            </span>
          ))}
        </div>

        {/* Streak counter */}
        {streak >= 3 && (
          <div className={`mb-2 ${showCombo ? "animate-combo" : ""}`}>
            <span className="text-[#f5c542] font-bold text-lg">
              &#x1F525; {streak}x STREAK
            </span>
          </div>
        )}

        {/* Timer Bar */}
        <div className="w-full h-4 bg-gray-700 rounded-full mb-10 overflow-hidden">
          <div
            className="h-full rounded-full"
            style={{
              width: `${progress * 100}%`,
              backgroundColor:
                progress > 0.5 ? "#4ade80" : progress > 0.25 ? "#f5c542" : "#e85d5d",
            }}
          />
        </div>

        {/* Word */}
        <h2
          className={`text-6xl md:text-8xl font-bold mb-8 ${
            isTrick ? "text-[#e85d5d]" : "text-white"
          } ${wordSlam ? "animate-word-slam" : ""}`}
        >
          {word}
        </h2>

        {/* Lives */}
        <div className="flex justify-center gap-3 mb-8">
          {Array.from({ length: MAX_LIVES }).map((_, i) => (
            <span
              key={i}
              className={`text-3xl transition-opacity duration-300 ${
                i < lives ? "opacity-100" : "opacity-30"
              }`}
            >
              &#x2764;&#xFE0F;
            </span>
          ))}
        </div>

        {/* Input */}
        <div className={`mb-6 ${shaking ? "animate-shake" : ""}`}>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Type here..."
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            className={`w-full max-w-md mx-auto block bg-[#2a2d35] border-2 border-[#4ade80] text-white text-xl text-center py-4 px-6 rounded-xl outline-none focus:border-[#22c55e] focus:shadow-[0_0_15px_rgba(74,222,128,0.3)] placeholder-gray-500 transition-all ${
              streak >= 3 ? "streak-glow" : ""
            }`}
          />
        </div>

        {/* Submit */}
        <button
          onClick={handleSubmit}
          className="bg-[#4ade80] hover:bg-[#22c55e] text-[#1a1d23] font-bold text-xl px-12 py-4 rounded-xl transition-colors cursor-pointer"
        >
          Submit
        </button>
      </div>
    </div>
  );
}
