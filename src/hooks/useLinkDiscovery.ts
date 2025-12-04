import { useEffect, useCallback, useState } from "react";
import { useSidecarStore } from "@/store/sidecarStore";

export function useLinkDiscovery() {
  const discoveryComplete = useSidecarStore((s) => s.discoveryComplete);
  const setDiscoveredLinks = useSidecarStore((s) => s.setDiscoveredLinks);
  const markDiscoveryComplete = useSidecarStore((s) => s.markDiscoveryComplete);
  const [isScanning, setIsScanning] = useState(false);

  useEffect(() => {
    if (discoveryComplete) return;
    if (typeof window === "undefined" || !window.electron) return;

    const runDiscovery = async () => {
      try {
        const availability = await window.electron.system.getCliAvailability();
        setDiscoveredLinks(availability);
        markDiscoveryComplete();
      } catch (error) {
        console.error("Link discovery failed:", error);
        markDiscoveryComplete();
      }
    };

    runDiscovery();
  }, [discoveryComplete, setDiscoveredLinks, markDiscoveryComplete]);

  const rescan = useCallback(async () => {
    if (typeof window === "undefined" || !window.electron) return;
    setIsScanning(true);
    try {
      const availability = await window.electron.system.refreshCliAvailability();
      setDiscoveredLinks(availability);
    } catch (error) {
      console.error("Link rescan failed:", error);
    } finally {
      setIsScanning(false);
    }
  }, [setDiscoveredLinks]);

  return { rescan, isScanning };
}
