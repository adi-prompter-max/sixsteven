"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import Link from "next/link";

interface LeaderboardEntry {
  name: string;
  score: number;
}

const STATIC_SEED: LeaderboardEntry[] = [
  { name: "Max", score: 45 },
  { name: "Pascal", score: 42 },
  { name: "Steven", score: 24 },
  { name: "Adi", score: 15 },
];

const MEDALS = ["#FFD700", "#C0C0C0", "#CD7F32"];

function getLocalLeaderboard(): LeaderboardEntry[] {
  try {
    const raw = localStorage.getItem("typeSixStevenLeaderboard");
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return [];
}

function saveLocalLeaderboard(entries: LeaderboardEntry[]) {
  localStorage.setItem("typeSixStevenLeaderboard", JSON.stringify(entries));
}

function mergeEntries(existing: LeaderboardEntry[], seed: LeaderboardEntry[]): LeaderboardEntry[] {
  const map = new Map<string, number>();
  for (const e of seed) {
    const key = e.name.toLowerCase();
    map.set(key, Math.max(map.get(key) ?? 0, e.score));
  }
  for (const e of existing) {
    const key = e.name.toLowerCase();
    map.set(key, Math.max(map.get(key) ?? 0, e.score));
  }
  return Array.from(map.entries())
    .map(([key, score]) => {
      const original = [...seed, ...existing].find((e) => e.name.toLowerCase() === key);
      return { name: original?.name ?? key, score };
    })
    .sort((a, b) => b.score - a.score);
}

export default function Leaderboard() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    let remote: LeaderboardEntry[] = [];
    try {
      if (supabase) {
        const { data } = await supabase
          .from("leaderboard")
          .select("name, score")
          .order("score", { ascending: false })
          .limit(50);
        if (data) remote = data;
      }
    } catch {
      // fall through
    }
    const local = getLocalLeaderboard();
    const merged = mergeEntries([...remote, ...local], STATIC_SEED);
    setEntries(merged);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="min-h-screen bg-[#1a1d23] flex items-center justify-center overflow-auto py-10">
      <div className="w-full max-w-lg mx-auto px-6">
        <h1 className="text-4xl md:text-5xl font-extrabold text-white text-center mb-2">
          Leaderboard
        </h1>
        <p className="text-gray-500 text-center mb-8">Top players of all time</p>

        {loading ? (
          <p className="text-gray-400 text-center">Loading...</p>
        ) : (
          <div className="space-y-3">
            {entries.map((entry, i) => (
              <div
                key={entry.name}
                className={`flex items-center justify-between px-5 py-4 rounded-xl transition-all ${
                  i < 3
                    ? "bg-[#2a2d35] border border-[#3a3d45]"
                    : "bg-[#22252b]"
                }`}
                style={{
                  animationDelay: `${i * 80}ms`,
                  animation: "slideIn 0.4s ease-out both",
                }}
              >
                <div className="flex items-center gap-4">
                  <span
                    className="text-2xl font-extrabold w-9 text-center"
                    style={{ color: i < 3 ? MEDALS[i] : "#6b7280" }}
                  >
                    {i + 1}
                  </span>
                  <span
                    className={`text-lg font-semibold ${
                      i === 0 ? "text-[#FFD700]" : "text-white"
                    }`}
                  >
                    {entry.name}
                  </span>
                </div>
                <span
                  className={`text-xl font-bold ${
                    i === 0 ? "text-[#4ade80]" : "text-gray-300"
                  }`}
                >
                  {entry.score}
                </span>
              </div>
            ))}

            {entries.length === 0 && (
              <p className="text-gray-500 text-center">No scores yet. Be the first!</p>
            )}
          </div>
        )}

        <div className="text-center mt-10">
          <Link
            href="/"
            className="bg-[#4ade80] hover:bg-[#22c55e] text-[#1a1d23] font-bold text-lg px-12 py-3 rounded-xl transition-colors inline-block"
          >
            Back to Game
          </Link>
        </div>
      </div>
    </div>
  );
}
