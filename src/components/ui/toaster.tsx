import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useNotificationStore, type Notification } from "@/store/notificationStore";

const ICONS = {
  success: CheckCircle,
  error: AlertCircle,
  info: Info,
  warning: AlertTriangle,
};

const VARIANTS = {
  success: "border-green-700/40 bg-green-900/30 text-green-300",
  error: "border-red-700/40 bg-red-900/30 text-red-300",
  info: "border-blue-700/40 bg-blue-900/30 text-blue-300",
  warning: "border-yellow-700/40 bg-yellow-900/30 text-yellow-300",
};

function Toast({ notification }: { notification: Notification }) {
  const removeNotification = useNotificationStore((state) => state.removeNotification);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Animate in
    requestAnimationFrame(() => setIsVisible(true));
  }, []);

  const handleDismiss = () => {
    setIsVisible(false);
    // Wait for animation
    setTimeout(() => removeNotification(notification.id), 150);
  };

  const Icon = ICONS[notification.type];
  const variantClass = VARIANTS[notification.type];

  return (
    <div
      className={cn(
        "pointer-events-auto flex w-full max-w-sm gap-2 rounded border p-3 transition-opacity duration-150 ease-out bg-[#1e1e1e]/90",
        isVisible ? "opacity-100" : "opacity-0",
        variantClass
      )}
      role="alert"
    >
      <Icon className="h-4 w-4 shrink-0 mt-0.5" />
      <div className="flex-1 break-words">
        {notification.title && (
          <h4 className="mb-1 font-medium leading-none">{notification.title}</h4>
        )}
        <p className="text-sm opacity-90">{notification.message}</p>
      </div>
      <button
        onClick={handleDismiss}
        className="shrink-0 rounded-md p-1 opacity-50 hover:opacity-100 transition-opacity focus:outline-none focus:ring-2 focus:ring-ring"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export function Toaster() {
  const notifications = useNotificationStore((state) => state.notifications);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return createPortal(
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-full max-w-sm pointer-events-none">
      {notifications.map((notification) => (
        <Toast key={notification.id} notification={notification} />
      ))}
    </div>,
    document.body
  );
}
