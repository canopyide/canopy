import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, m } from "framer-motion";

function getThemeParticleColors(): string[] {
  if (typeof document === "undefined") {
    return ["#34d399", "#34d399", "#fbbf24", "#38bdf8", "#38bdf8", "#a78bfa"];
  }
  const styles = getComputedStyle(document.documentElement);
  const get = (token: string, fallback: string) =>
    styles.getPropertyValue(token).trim() || fallback;
  return [
    get("--theme-accent-primary", "#34d399"),
    get("--theme-status-success", "#34d399"),
    get("--theme-status-warning", "#fbbf24"),
    get("--theme-status-info", "#38bdf8"),
    get("--theme-activity-active", "#38bdf8"),
    get("--theme-activity-working", "#a78bfa"),
  ];
}

interface Particle {
  id: number;
  x: number;
  y: number;
  rotate: number;
  size: number;
  color: string;
}

function generateParticles(): Particle[] {
  const colors = getThemeParticleColors();
  const count = 6 + Math.floor(Math.random() * 3); // 6-8 particles
  return Array.from({ length: count }, (_, i) => {
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
    const distance = 80 + Math.random() * 120;
    return {
      id: i,
      x: Math.cos(angle) * distance,
      y: Math.sin(angle) * distance,
      rotate: Math.random() * 360,
      size: 6 + Math.random() * 6,
      color: colors[i % colors.length]!,
    };
  });
}

function isReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return true;
  if (typeof document !== "undefined") {
    return document.body.getAttribute("data-reduce-animations") === "true";
  }
  return false;
}

// Falls back to viewport center if the checklist isn't mounted (e.g. user
// dismissed it before the 4th item completed).
function readAnchor(): { x: number; y: number } {
  if (typeof document === "undefined" || typeof window === "undefined") {
    return { x: 0, y: 0 };
  }
  const el = document.querySelector("[data-getting-started-checklist]");
  if (el instanceof HTMLElement) {
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 || rect.height > 0) {
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }
  }
  return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
}

export function CelebrationConfetti() {
  const [reducedMotion] = useState(isReducedMotion);
  const [particles] = useState(generateParticles);
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (reducedMotion) return;
    setAnchor(readAnchor());
  }, [reducedMotion]);

  if (reducedMotion) {
    return createPortal(
      <div
        aria-hidden="true"
        className="fixed inset-0 pointer-events-none z-[var(--z-toast)] bg-status-success/15 animate-checklist-complete-flash"
      />,
      document.body
    );
  }

  if (!anchor) return null;

  return createPortal(
    <div
      aria-hidden="true"
      className="fixed pointer-events-none z-[var(--z-toast)]"
      style={{ left: anchor.x, top: anchor.y, width: 0, height: 0 }}
    >
      <AnimatePresence>
        {particles.map((p) => (
          <m.div
            key={p.id}
            className="absolute rounded-full"
            style={{ width: p.size, height: p.size, backgroundColor: p.color }}
            initial={{ x: 0, y: 0, scale: 0, opacity: 1 }}
            animate={{
              x: p.x,
              y: p.y,
              scale: [0, 1.5, 1],
              rotate: p.rotate,
              opacity: [1, 1, 0],
            }}
            exit={{ opacity: 0, scale: 0 }}
            transition={{
              type: "spring",
              stiffness: 60,
              damping: 15,
              mass: 0.5,
              opacity: { duration: 0.6, ease: "easeOut" },
            }}
          />
        ))}
      </AnimatePresence>
    </div>,
    document.body
  );
}
