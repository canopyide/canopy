import { Loader2 } from "lucide-react";
import { getBrandColorHex } from "@/lib/colorUtils";
import type { TerminalInstance } from "@/store";

interface TerminalDragPreviewProps {
  terminal: TerminalInstance;
}

export function TerminalDragPreview({ terminal }: TerminalDragPreviewProps) {
  const brandColor = getBrandColorHex(terminal.type);
  const isWorking = terminal.agentState === "working";

  return (
    <div
      className="pointer-events-none select-none"
      style={{
        width: 160,
        height: 100,
        backgroundColor: "#18181b",
        border: "1px solid #27272a",
        borderRadius: 8,
        boxShadow: "0 8px 24px rgba(0, 0, 0, 0.6)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Title bar */}
      <div
        style={{
          height: 24,
          padding: "0 8px",
          backgroundColor: "#27272a",
          borderBottom: "1px solid #3f3f46",
          display: "flex",
          alignItems: "center",
          gap: 6,
          flexShrink: 0,
        }}
      >
        {/* Icon */}
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            backgroundColor: brandColor || "#e4e4e7",
            flexShrink: 0,
          }}
        />

        {/* Title text */}
        <span
          style={{
            fontFamily: "Menlo, Monaco, Consolas, monospace",
            fontSize: 11,
            fontWeight: 500,
            color: "#e4e4e7",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            flex: 1,
          }}
        >
          {terminal.title}
        </span>

        {/* Working indicator */}
        {isWorking && (
          <Loader2
            className="w-3 h-3 animate-spin"
            style={{ color: brandColor }}
            aria-hidden="true"
          />
        )}
      </div>

      {/* Terminal body (ghost content) */}
      <div
        style={{
          flex: 1,
          padding: 8,
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        {/* Ghost lines to simulate terminal content */}
        <div
          style={{
            height: 6,
            width: "70%",
            backgroundColor: "rgba(255, 255, 255, 0.06)",
            borderRadius: 2,
          }}
        />
        <div
          style={{
            height: 6,
            width: "50%",
            backgroundColor: "rgba(255, 255, 255, 0.06)",
            borderRadius: 2,
          }}
        />
        <div
          style={{
            height: 6,
            width: "40%",
            backgroundColor: "rgba(255, 255, 255, 0.06)",
            borderRadius: 2,
          }}
        />
      </div>
    </div>
  );
}
