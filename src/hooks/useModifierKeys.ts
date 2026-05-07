import { useState, useEffect } from "react";

export interface ModifierState {
  meta: boolean;
  alt: boolean;
}

export function useModifierKeys(): ModifierState {
  const [modifiers, setModifiers] = useState<ModifierState>({ meta: false, alt: false });

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "Meta" || e.key === "Control") {
        setModifiers((m) => (m.meta ? m : { ...m, meta: true }));
      }
      if (e.key === "Alt") {
        setModifiers((m) => (m.alt ? m : { ...m, alt: true }));
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === "Meta" || e.key === "Control") {
        setModifiers((m) => (!m.meta ? m : { ...m, meta: false }));
      }
      if (e.key === "Alt") {
        setModifiers((m) => (!m.alt ? m : { ...m, alt: false }));
      }
    };
    const reset = () => setModifiers({ meta: false, alt: false });
    const visibility = () => {
      if (document.hidden) reset();
    };

    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", reset);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", reset);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);

  return modifiers;
}
