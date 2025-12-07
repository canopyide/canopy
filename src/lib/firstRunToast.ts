const STORAGE_KEY = "canopy:first-run-toast";

let sessionGuard = false;

export function shouldShowFirstRunToast(): boolean {
  if (sessionGuard) return false;

  try {
    return !localStorage.getItem(STORAGE_KEY);
  } catch (error) {
    console.warn("[firstRunToast] localStorage unavailable, using session guard:", error);
    return false;
  }
}

export function markFirstRunToastSeen(): void {
  sessionGuard = true;

  try {
    localStorage.setItem(STORAGE_KEY, "true");
  } catch (error) {
    console.warn("[firstRunToast] Failed to persist first-run flag:", error);
  }
}
