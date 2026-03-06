"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";

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
const TIME_DECREASE = 150;
const MIN_TIME = 1500;
const MAX_LIVES = 3;
const TRICK_CHANCE = 0.15;

// Progressive unlock thresholds
const PHASE_1_SCORE = 15; // Easy math (addition only) + backwards
const PHASE_2_SCORE = 20; // + memory, missing letter, harder math (subtraction)
const PHASE_3_SCORE = 28; // + math trick, multiplication — full chaos

type GameScreen = "home" | "playing" | "gameover";
type ChallengeType = "normal" | "trick" | "math" | "math_trick" | "memory" | "backwards" | "missing";

interface Challenge {
  type: ChallengeType;
  display: string;         // what to show on screen
  expected: string;        // correct answer
  hint: string;            // small instruction text
  memoryWord?: string;     // for memory: the word to remember
  color?: string;          // display color override
}

interface Particle {
  id: number;
  x: number;
  y: number;
  angle: number;
  speed: number;
  color: string;
  size: number;
}

// ===== CHALLENGE GENERATORS =====

function pickWord(): string {
  return VALID_WORDS[Math.floor(Math.random() * VALID_WORDS.length)];
}

function reverseString(s: string): string {
  return s.split("").reverse().join("");
}

function generateMathProblem(phase: 1 | 2 | 3): { display: string; answer: number } {
  if (phase === 1) {
    // Addition only, small numbers
    const a = 2 + Math.floor(Math.random() * 20);
    const b = 2 + Math.floor(Math.random() * 20);
    return { display: `${a} + ${b}`, answer: a + b };
  }

  if (phase === 2) {
    // Addition + subtraction
    if (Math.random() < 0.5) {
      const a = 5 + Math.floor(Math.random() * 30);
      const b = 2 + Math.floor(Math.random() * 20);
      return { display: `${a} + ${b}`, answer: a + b };
    }
    const a = 10 + Math.floor(Math.random() * 40);
    const b = 1 + Math.floor(Math.random() * a);
    return { display: `${a} - ${b}`, answer: a - b };
  }

  // Phase 3: all ops including multiplication
  const ops = [
    { sym: "+", fn: (a: number, b: number) => a + b },
    { sym: "-", fn: (a: number, b: number) => a - b },
    { sym: "x", fn: (a: number, b: number) => a * b },
  ];
  const op = ops[Math.floor(Math.random() * ops.length)];
  let a: number, b: number;

  if (op.sym === "x") {
    a = 2 + Math.floor(Math.random() * 9);
    b = 2 + Math.floor(Math.random() * 9);
  } else if (op.sym === "-") {
    a = 10 + Math.floor(Math.random() * 40);
    b = 1 + Math.floor(Math.random() * a);
  } else {
    a = 5 + Math.floor(Math.random() * 45);
    b = 5 + Math.floor(Math.random() * 45);
  }

  return { display: `${a} ${op.sym} ${b}`, answer: op.fn(a, b) };
}

function generateMathTrickProblem(): { display: string; answer: number } {
  // Generate a problem that equals 12 (trigger: type "steven")
  const ways: [number, string, number][] = [
    [6, "+", 6], [4, "x", 3], [3, "x", 4], [2, "x", 6],
    [6, "x", 2], [15, "-", 3], [20, "-", 8], [7, "+", 5],
    [9, "+", 3], [24, "-", 12],
  ];
  const [a, sym, b] = ways[Math.floor(Math.random() * ways.length)];
  return { display: `${a} ${sym} ${b}`, answer: 12 };
}

function generateMissingLetter(): { display: string; answer: string } {
  const word = pickWord();
  const idx = Math.floor(Math.random() * word.length);
  const missing = word[idx];
  const display = word.slice(0, idx) + "_" + word.slice(idx + 1);
  return { display, answer: missing };
}

function generateChallenge(score: number): Challenge {
  // Always a chance for the original "six" trick
  if (Math.random() < TRICK_CHANCE) {
    return { type: "trick", display: TRICK_WORD, expected: TRICK_ANSWER, hint: "", color: "#e85d5d" };
  }

  // Before phase 1: only normal words
  if (score < PHASE_1_SCORE) {
    const w = pickWord();
    return { type: "normal", display: w, expected: w, hint: "" };
  }

  // Chaos chance ramps up gently within each phase
  let chaosChance: number;
  if (score < PHASE_2_SCORE) {
    // Phase 1 (15-19): 25% -> 35% chaos
    chaosChance = 0.25 + (score - PHASE_1_SCORE) * 0.02;
  } else if (score < PHASE_3_SCORE) {
    // Phase 2 (20-27): 35% -> 50% chaos
    chaosChance = 0.35 + (score - PHASE_2_SCORE) * 0.02;
  } else {
    // Phase 3 (28+): 50% -> 65% chaos (caps at ~score 43)
    chaosChance = Math.min(0.65, 0.50 + (score - PHASE_3_SCORE) * 0.01);
  }

  if (Math.random() >= chaosChance) {
    const w = pickWord();
    return { type: "normal", display: w, expected: w, hint: "" };
  }

  // Pick challenge based on current phase
  let pool: { type: string; weight: number }[];

  if (score < PHASE_2_SCORE) {
    // Phase 1: easy math (addition) + backwards only
    pool = [
      { type: "math", weight: 50 },
      { type: "backwards", weight: 50 },
    ];
  } else if (score < PHASE_3_SCORE) {
    // Phase 2: + memory, missing letter, harder math
    pool = [
      { type: "math", weight: 30 },
      { type: "backwards", weight: 25 },
      { type: "memory", weight: 25 },
      { type: "missing", weight: 20 },
    ];
  } else {
    // Phase 3: everything including math trick
    pool = [
      { type: "math", weight: 25 },
      { type: "backwards", weight: 20 },
      { type: "memory", weight: 20 },
      { type: "missing", weight: 15 },
      { type: "math_trick", weight: 20 },
    ];
  }

  const total = pool.reduce((a, b) => a + b.weight, 0);
  let r = Math.random() * total;
  let chosen = pool[0].type;
  for (const p of pool) {
    r -= p.weight;
    if (r <= 0) { chosen = p.type; break; }
  }

  const mathPhase: 1 | 2 | 3 = score < PHASE_2_SCORE ? 1 : score < PHASE_3_SCORE ? 2 : 3;

  switch (chosen) {
    case "math": {
      const { display, answer } = generateMathProblem(mathPhase);
      return { type: "math", display, expected: String(answer), hint: "Solve it!", color: "#a78bfa" };
    }
    case "math_trick": {
      const { display } = generateMathTrickProblem();
      return { type: "math_trick", display, expected: TRICK_ANSWER, hint: "Solve it!", color: "#e85d5d" };
    }
    case "memory": {
      const w = pickWord();
      return { type: "memory", display: w, expected: w, hint: "Remember this!", memoryWord: w, color: "#38bdf8" };
    }
    case "backwards": {
      const w = pickWord();
      return { type: "backwards", display: reverseString(w), expected: w, hint: "Type it forwards!", color: "#fb923c" };
    }
    case "missing": {
      const { display, answer } = generateMissingLetter();
      return { type: "missing", display, expected: answer, hint: "Type the missing letter!", color: "#f472b6" };
    }
  }

  const w = pickWord();
  return { type: "normal", display: w, expected: w, hint: "" };
}

function getTimeDuration(score: number) {
  return Math.max(MIN_TIME, INITIAL_TIME - score * TIME_DECREASE);
}

const PARTICLE_COLORS = ["#4ade80", "#22c55e", "#86efac", "#f5c542", "#fbbf24", "#a3e635"];

const CHALLENGE_LABELS: Record<ChallengeType, string> = {
  normal: "",
  trick: "",
  math: "MATH",
  math_trick: "MATH",
  memory: "MEMORY",
  backwards: "BACKWARDS",
  missing: "MISSING LETTER",
};

const CHALLENGE_BADGE_COLORS: Record<ChallengeType, string> = {
  normal: "",
  trick: "",
  math: "#a78bfa",
  math_trick: "#e85d5d",
  memory: "#38bdf8",
  backwards: "#fb923c",
  missing: "#f472b6",
};

export default function Home() {
  const [screen, setScreen] = useState<GameScreen>("home");
  const [challenge, setChallenge] = useState<Challenge>({ type: "normal", display: "", expected: "", hint: "" });
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
  const [playerName, setPlayerName] = useState("");
  const [submitted, setSubmitted] = useState(false);

  // Memory challenge states
  const [memoryHidden, setMemoryHidden] = useState(false);
  const [showNewMode, setShowNewMode] = useState(false);
  const [chaosUnlocked, setChaosUnlocked] = useState(false);
  const [bannerText, setBannerText] = useState("");

  const inputRef = useRef<HTMLInputElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const memoryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef(0);
  const durationRef = useRef(INITIAL_TIME);
  const scoreRef = useRef(0);
  const livesRef = useRef(MAX_LIVES);
  const streakRef = useRef(0);
  const floatIdRef = useRef(0);
  const particleIdRef = useRef(0);
  const challengeRef = useRef<Challenge>(challenge);

  scoreRef.current = score;
  livesRef.current = lives;
  streakRef.current = streak;
  challengeRef.current = challenge;

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
    if (memoryTimeoutRef.current) {
      clearTimeout(memoryTimeoutRef.current);
      memoryTimeoutRef.current = null;
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
      setFlashing(true);
      setTimeout(() => setFlashing(false), 400);

      setScorePop(true);
      setTimeout(() => setScorePop(false), 500);

      const floatText = newStreak >= 3 ? `+${newStreak}` : "+1";
      const id = floatIdRef.current++;
      setFloats((prev) => [...prev, { id, text: floatText }]);
      setTimeout(() => setFloats((prev) => prev.filter((f) => f.id !== id)), 800);

      setWordSlam(true);
      setTimeout(() => setWordSlam(false), 350);

      spawnParticles();

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
      // Show unlock banners at phase transitions
      if (newScore === PHASE_1_SCORE || newScore === PHASE_2_SCORE || newScore === PHASE_3_SCORE) {
        if (!chaosUnlocked || newScore > PHASE_1_SCORE) {
          setChaosUnlocked(true);
          setShowNewMode(true);
          setBannerText(
            newScore === PHASE_1_SCORE ? "CHALLENGES UNLOCKED!\nMath & Backwards incoming..."
            : newScore === PHASE_2_SCORE ? "PHASE 2!\nMemory & Missing Letter added..."
            : "FULL CHAOS!\nMath Trick & Multiplication unleashed..."
          );
          setTimeout(() => setShowNewMode(false), 2500);
        }
      }

      const ch = generateChallenge(newScore);
      setChallenge(ch);
      challengeRef.current = ch;
      setInput("");
      setMemoryHidden(false);

      // Memory challenges get extra time
      const baseDur = getTimeDuration(newScore);
      const dur = ch.type === "memory" ? baseDur + 1500 : baseDur;
      durationRef.current = dur;

      const startDelay = ch.type === "memory" ? delay + 100 : delay;

      setTimeout(() => {
        setProgress(1);
        startRef.current = Date.now();

        // Memory: show word for a flash then hide it
        if (ch.type === "memory") {
          const flashTime = Math.max(800, 1500 - Math.floor(newScore / 5) * 100);
          memoryTimeoutRef.current = setTimeout(() => {
            setMemoryHidden(true);
          }, flashTime);
        }

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
      }, startDelay);
    },
    [stopTimer, shake, saveHighScore, chaosUnlocked]
  );

  const submitToLeaderboard = useCallback(async (name: string, finalScore: number) => {
    const trimmed = name.trim();
    if (!trimmed || finalScore <= 0) return;
    try {
      const raw = localStorage.getItem("typeSixStevenLeaderboard");
      const entries: { name: string; score: number }[] = raw ? JSON.parse(raw) : [];
      const existing = entries.find((e) => e.name.toLowerCase() === trimmed.toLowerCase());
      if (existing) {
        existing.score = Math.max(existing.score, finalScore);
        existing.name = trimmed;
      } else {
        entries.push({ name: trimmed, score: finalScore });
      }
      localStorage.setItem("typeSixStevenLeaderboard", JSON.stringify(entries));
    } catch { /* ignore */ }
    try {
      if (supabase) {
        const { data } = await supabase
          .from("leaderboard")
          .select("id, score")
          .ilike("name", trimmed)
          .limit(1)
          .single();
        if (data && data.score >= finalScore) {
          // skip
        } else if (data) {
          await supabase.from("leaderboard").update({ score: finalScore, name: trimmed }).eq("id", data.id);
        } else {
          await supabase.from("leaderboard").insert({ name: trimmed, score: finalScore });
        }
      }
    } catch { /* localStorage fallback already saved */ }
    setSubmitted(true);
  }, []);

  const startGame = useCallback(() => {
    setScreen("playing");
    setScore(0);
    setLives(MAX_LIVES);
    setStreak(0);
    scoreRef.current = 0;
    livesRef.current = MAX_LIVES;
    streakRef.current = 0;
    setInput("");
    setPlayerName("");
    setSubmitted(false);
    setParticles([]);
    setFloats([]);
    setMemoryHidden(false);
    setChaosUnlocked(false);
    setShowNewMode(false);
    setBannerText("");
    nextRound(0);
  }, [nextRound]);

  const handleSubmit = useCallback(() => {
    const trimmed = input.trim().toLowerCase();
    if (!trimmed) return;

    const ch = challengeRef.current;
    const expected = ch.expected.toLowerCase();

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
  }, [input, stopTimer, nextRound, shake, saveHighScore, triggerHitEffects]);

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

          <div className="text-gray-400 text-base space-y-1 mb-4">
            <p>&#x23F1;&#xFE0F; Timer gets faster each word</p>
            <p>&#x2764;&#xFE0F; 3 lives &mdash; don&apos;t lose them all</p>
            <p>&#x26A1; Watch out for the trick!</p>
          </div>

          <div className="bg-[#2a2d35] rounded-xl p-4 mb-8 border border-[#3a3d45] text-left">
            <p className="text-[#f5c542] font-bold text-sm mb-3 uppercase tracking-wider text-center">Challenges Unlock as You Go</p>
            <div className="text-gray-400 text-sm space-y-2">
              <div>
                <p className="text-gray-300 font-semibold text-xs uppercase tracking-wide mb-1">Level 15</p>
                <p><span className="text-[#a78bfa] font-semibold">MATH</span> &mdash; Quick addition</p>
                <p><span className="text-[#fb923c] font-semibold">BACKWARDS</span> &mdash; Read it in reverse</p>
              </div>
              <div>
                <p className="text-gray-300 font-semibold text-xs uppercase tracking-wide mb-1">Level 20</p>
                <p><span className="text-[#38bdf8] font-semibold">MEMORY</span> &mdash; Word flashes, then vanishes</p>
                <p><span className="text-[#f472b6] font-semibold">MISSING</span> &mdash; Fill the blank letter</p>
              </div>
              <div>
                <p className="text-gray-300 font-semibold text-xs uppercase tracking-wide mb-1">Level 28 &mdash; Full Chaos</p>
                <p><span className="text-[#e85d5d] font-semibold">MATH TRICK</span> &mdash; Answer = 12? Type steven!</p>
                <p className="text-gray-500 text-xs">+ multiplication &amp; harder equations</p>
              </div>
            </div>
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

          <div className="mt-6">
            <Link
              href="/leaderboard"
              className="text-[#4ade80] hover:text-[#22c55e] font-semibold text-lg transition-colors underline underline-offset-4"
            >
              View Leaderboard
            </Link>
          </div>
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
            <p className="text-gray-400 text-lg mb-6">&#x1F3C6; Best: {Math.max(highScore, score)}</p>
          )}

          {!submitted ? (
            <div className="mb-6">
              <p className="text-gray-400 text-sm mb-2">Enter your name for the leaderboard</p>
              <div className="flex gap-3 justify-center max-w-sm mx-auto">
                <input
                  type="text"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && playerName.trim()) submitToLeaderboard(playerName, score);
                  }}
                  placeholder="Your name"
                  maxLength={20}
                  autoComplete="off"
                  className="flex-1 bg-[#2a2d35] border-2 border-gray-600 text-white text-lg text-center py-3 px-4 rounded-xl outline-none focus:border-[#4ade80] placeholder-gray-500 transition-colors"
                />
                <button
                  onClick={() => submitToLeaderboard(playerName, score)}
                  disabled={!playerName.trim()}
                  className="bg-[#f5c542] hover:bg-[#d4a82f] disabled:opacity-40 disabled:cursor-not-allowed text-[#1a1d23] font-bold text-lg px-6 py-3 rounded-xl transition-colors cursor-pointer"
                >
                  Submit
                </button>
              </div>
            </div>
          ) : (
            <p className="text-[#4ade80] font-semibold text-lg mb-6">Score submitted!</p>
          )}

          <div className="flex flex-col items-center gap-4">
            <button
              onClick={startGame}
              className="bg-[#4ade80] hover:bg-[#22c55e] text-[#1a1d23] font-bold text-xl px-16 py-4 rounded-xl transition-colors cursor-pointer"
            >
              Play Again
            </button>
            <Link
              href="/leaderboard"
              className="text-[#4ade80] hover:text-[#22c55e] font-semibold text-lg transition-colors underline underline-offset-4"
            >
              View Leaderboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // =================== PLAYING ===================
  const isTrick = challenge.type === "trick" || challenge.type === "math_trick";
  const label = CHALLENGE_LABELS[challenge.type];
  const badgeColor = CHALLENGE_BADGE_COLORS[challenge.type];
  const displayColor = challenge.color || (isTrick ? "#e85d5d" : "#ffffff");

  // What to show for the main word area
  let displayContent = challenge.display;
  if (challenge.type === "memory" && memoryHidden) {
    displayContent = "? ? ?";
  }

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

      {/* Chaos Mode unlock banner */}
      {showNewMode && (
        <div className="absolute top-0 left-0 right-0 z-50 flex justify-center pointer-events-none">
          <div className="animate-chaos-banner bg-gradient-to-r from-[#a78bfa] via-[#f472b6] to-[#fb923c] text-white font-extrabold text-xl md:text-2xl px-8 py-4 rounded-b-2xl shadow-2xl text-center whitespace-pre-line">
            {bannerText.split("\n").map((line, i) =>
              i === 0 ? <span key={i}>{line}</span> : <span key={i} className="block text-sm font-normal opacity-90">{line}</span>
            )}
          </div>
        </div>
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

        {/* Challenge type badge */}
        {label && (
          <div className="mb-3 animate-badge-pop">
            <span
              className="text-xs font-extrabold uppercase tracking-widest px-4 py-1.5 rounded-full"
              style={{ backgroundColor: badgeColor, color: "#1a1d23" }}
            >
              {label}
            </span>
          </div>
        )}

        {/* Timer Bar */}
        <div className="w-full h-4 bg-gray-700 rounded-full mb-8 overflow-hidden">
          <div
            className="h-full rounded-full"
            style={{
              width: `${progress * 100}%`,
              backgroundColor:
                progress > 0.5 ? "#4ade80" : progress > 0.25 ? "#f5c542" : "#e85d5d",
            }}
          />
        </div>

        {/* Hint text */}
        {challenge.hint && (
          <p
            className="text-sm font-semibold mb-2 animate-fade-in"
            style={{ color: challenge.color || "#9ca3af" }}
          >
            {challenge.hint}
          </p>
        )}

        {/* Word / Challenge display */}
        <h2
          className={`font-bold mb-8 ${wordSlam ? "animate-word-slam" : ""} ${
            challenge.type === "memory" && memoryHidden ? "animate-memory-fade text-gray-600" : ""
          } ${challenge.type === "math" || challenge.type === "math_trick" ? "text-5xl md:text-7xl" : "text-6xl md:text-8xl"}`}
          style={{ color: challenge.type === "memory" && memoryHidden ? "#4b5563" : displayColor }}
        >
          {displayContent}
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
            placeholder={
              challenge.type === "missing" ? "Type the missing letter..."
              : challenge.type === "math" || challenge.type === "math_trick" ? "Type the answer..."
              : challenge.type === "memory" && memoryHidden ? "What was the word?"
              : challenge.type === "backwards" ? "Type it forwards..."
              : "Type here..."
            }
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
