import { create, type StateCreator } from "zustand";
import type { AssistantMessage } from "@/components/Assistant/types";

export interface ConversationState {
  messages: AssistantMessage[];
  sessionId: string;
  isLoading: boolean;
  error: string | null;
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function createInitialConversation(): ConversationState {
  return {
    messages: [],
    sessionId: generateId(),
    isLoading: false,
    error: null,
  };
}

interface AssistantChatState {
  conversation: ConversationState;
}

interface AssistantChatActions {
  addMessage: (message: AssistantMessage) => void;
  updateMessage: (messageId: string, updates: Partial<AssistantMessage>) => void;
  updateLastMessage: (updates: Partial<AssistantMessage>) => void;
  setMessages: (messages: AssistantMessage[]) => void;
  setLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
  clearConversation: () => void;
  reset: () => void;
}

const initialState: AssistantChatState = {
  conversation: createInitialConversation(),
};

const createAssistantChatStore: StateCreator<AssistantChatState & AssistantChatActions> = (
  set,
  get
) => ({
  ...initialState,

  addMessage: (message) => {
    set((s) => ({
      conversation: {
        ...s.conversation,
        messages: [...s.conversation.messages, message],
      },
    }));
  },

  updateMessage: (messageId, updates) => {
    set((s) => {
      const messages = s.conversation.messages.map((msg) =>
        msg.id === messageId ? { ...msg, ...updates } : msg
      );

      return {
        conversation: { ...s.conversation, messages },
      };
    });
  },

  updateLastMessage: (updates) => {
    set((s) => {
      const messages = [...s.conversation.messages];
      if (messages.length === 0) return s;

      const lastIndex = messages.length - 1;
      messages[lastIndex] = { ...messages[lastIndex], ...updates };

      return {
        conversation: { ...s.conversation, messages },
      };
    });
  },

  setMessages: (messages) => {
    set((s) => ({
      conversation: { ...s.conversation, messages },
    }));
  },

  setLoading: (isLoading) => {
    set((s) => ({
      conversation: { ...s.conversation, isLoading },
    }));
  },

  setError: (error) => {
    set((s) => ({
      conversation: { ...s.conversation, error },
    }));
  },

  clearConversation: () => {
    const sessionId = get().conversation.sessionId;
    if (sessionId) {
      window.electron.assistant.clearSession(sessionId).catch((err) => {
        console.error("[AssistantChatStore] Failed to clear session:", err);
      });
    }

    set({
      conversation: createInitialConversation(),
    });
  },

  reset: () => set({ conversation: createInitialConversation() }),
});

export const useAssistantChatStore = create<AssistantChatState & AssistantChatActions>()(
  createAssistantChatStore
);
