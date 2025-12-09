import { create } from "zustand";
import { DEFAULT_TERMINAL_FONT_FAMILY, DEFAULT_TERMINAL_FONT_SIZE } from "@/config/terminalFont";

interface TerminalFontState {
  fontSize: number;
  fontFamily: string;
  setFontSize: (size: number) => void;
  setFontFamily: (family: string) => void;
}

export const useTerminalFontStore = create<TerminalFontState>()((set) => ({
  fontSize: DEFAULT_TERMINAL_FONT_SIZE,
  fontFamily: DEFAULT_TERMINAL_FONT_FAMILY,
  setFontSize: (size) => set({ fontSize: size }),
  setFontFamily: (family) => set({ fontFamily: family }),
}));
