"use client";
import { useEffect, useState } from "react";

type Mode = "auto" | "light" | "dark";

export default function ThemeToggle() {
  const [mode, setMode] = useState<Mode>("auto");

  useEffect(() => {
    try {
      const saved = localStorage.getItem("vm-theme");
      if (saved === "light" || saved === "dark") {
        setMode(saved);
        document.documentElement.dataset.theme = saved;
      }
    } catch { /* storage unavailable: stay on auto */ }
  }, []);

  function pick(next: Mode) {
    setMode(next);
    try {
      if (next === "auto") {
        document.documentElement.removeAttribute("data-theme");
        localStorage.removeItem("vm-theme");
      } else {
        document.documentElement.dataset.theme = next;
        localStorage.setItem("vm-theme", next);
      }
    } catch { /* ignore */ }
  }

  return (
    <div className="seg" role="group" aria-label="Colour theme">
      {(["auto", "light", "dark"] as const).map((m) => (
        <button key={m} aria-pressed={mode === m} onClick={() => pick(m)}>{m[0].toUpperCase() + m.slice(1)}</button>
      ))}
    </div>
  );
}
