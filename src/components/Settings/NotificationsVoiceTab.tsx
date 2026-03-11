import { NotificationSettingsTab } from "./NotificationSettingsTab";
import { VoiceInputSettingsTab } from "./VoiceInputSettingsTab";

export function NotificationsVoiceTab() {
  return (
    <div className="space-y-8">
      <section id="notifications-alerts">
        <h2 className="text-base font-semibold text-canopy-text mb-4 scroll-mt-4">Notifications</h2>
        <NotificationSettingsTab />
      </section>

      <hr className="border-canopy-border" />

      <section id="notifications-voice">
        <h2 className="text-base font-semibold text-canopy-text mb-4 scroll-mt-4">Voice Input</h2>
        <VoiceInputSettingsTab />
      </section>
    </div>
  );
}
