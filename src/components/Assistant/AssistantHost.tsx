import { useAssistantUiStore } from "@/store/assistantUiStore";
import { AssistantPane } from "./AssistantPane";

export function AssistantHost() {
  const isOpen = useAssistantUiStore((s) => s.isOpen);

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/50 transition-opacity ${
        isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
      }`}
    >
      <div
        className={`w-full max-w-3xl h-[80vh] bg-canopy-bg rounded-lg shadow-2xl overflow-hidden flex flex-col transition-transform ${
          isOpen ? "scale-100" : "scale-95"
        }`}
      >
        <AssistantPane />
      </div>
    </div>
  );
}
