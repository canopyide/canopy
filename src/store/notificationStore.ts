import { create } from "zustand";

// Use crypto.randomUUID for ID generation
const uuidv4 = () => crypto.randomUUID();

export type NotificationType = "success" | "error" | "info" | "warning";

export interface Notification {
  id: string;
  type: NotificationType;
  title?: string;
  message: string;
  duration?: number; // in ms, default 5000
}

interface NotificationStore {
  notifications: Notification[];
  addNotification: (notification: Omit<Notification, "id">) => string;
  removeNotification: (id: string) => void;
  clearNotifications: () => void;
}

export const useNotificationStore = create<NotificationStore>((set) => ({
  notifications: [],
  addNotification: (notification) => {
    const id = uuidv4();
    const newNotification = { ...notification, id };

    set((state) => ({
      notifications: [...state.notifications, newNotification],
    }));

    if (notification.duration !== 0) {
      // 0 = persistent
      setTimeout(() => {
        set((state) => ({
          notifications: state.notifications.filter((n) => n.id !== id),
        }));
      }, notification.duration || 5000);
    }

    return id;
  },
  removeNotification: (id) =>
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    })),
  clearNotifications: () => set({ notifications: [] }),
}));
