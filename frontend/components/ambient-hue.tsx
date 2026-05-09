"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { DailyState } from "@/lib/api";

/**
 * Drives `--ambient-hue` / `--ambient-chroma` / `--ambient-strength` on <html>
 * from today's recovery score, so the page bloom subtly tints toward
 * green/amber/red without taking attention from the data.
 */
export function AmbientHue() {
  const { data } = useQuery<DailyState>({
    queryKey: ["daily-state"],
    queryFn: api.dailyState,
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    const score = data?.recovery?.score;
    const root = document.documentElement;
    if (score == null) {
      root.style.setProperty("--ambient-hue", "210");
      root.style.setProperty("--ambient-chroma", "0.14");
      root.style.setProperty("--ambient-strength", "0.14");
      return;
    }
    // 0=red(25), 50=amber(75), 100=green(145). Lerp between waypoints.
    let hue: number;
    if (score < 50) hue = 25 + (75 - 25) * (score / 50);
    else hue = 75 + (145 - 75) * ((score - 50) / 50);
    const chroma = 0.13 + Math.min(0.05, Math.abs(score - 60) / 800);
    // A little more presence on the extremes (great recovery feels lush; poor recovery feels warm).
    const strength = 0.13 + Math.abs(score - 60) / 600;
    root.style.setProperty("--ambient-hue", hue.toFixed(1));
    root.style.setProperty("--ambient-chroma", chroma.toFixed(3));
    root.style.setProperty("--ambient-strength", strength.toFixed(3));
  }, [data]);

  return null;
}
