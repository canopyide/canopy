import { app } from "electron";
import fs from "node:fs";
import path from "node:path";
import { store } from "../store.js";
import { closeTelemetry } from "./TelemetryService.js";

const GPU_DISABLED_FLAG = "gpu-disabled.flag";
const GPU_ANGLE_FALLBACK_FLAG = "gpu-angle-fallback.flag";
const GPU_CRASH_THRESHOLD = 3;

export function isGpuDisabledByFlag(userDataPath: string): boolean {
  return fs.existsSync(path.join(userDataPath, GPU_DISABLED_FLAG));
}

export function writeGpuDisabledFlag(userDataPath: string): void {
  fs.writeFileSync(path.join(userDataPath, GPU_DISABLED_FLAG), String(Date.now()), "utf8");
}

export function clearGpuDisabledFlag(userDataPath: string): void {
  const flagPath = path.join(userDataPath, GPU_DISABLED_FLAG);
  if (fs.existsSync(flagPath)) {
    fs.unlinkSync(flagPath);
  }
}

export function isGpuAngleFallbackByFlag(userDataPath: string): boolean {
  return fs.existsSync(path.join(userDataPath, GPU_ANGLE_FALLBACK_FLAG));
}

export function writeGpuAngleFallbackFlag(userDataPath: string): void {
  fs.writeFileSync(path.join(userDataPath, GPU_ANGLE_FALLBACK_FLAG), String(Date.now()), "utf8");
}

export function clearGpuAngleFallbackFlag(userDataPath: string): void {
  const flagPath = path.join(userDataPath, GPU_ANGLE_FALLBACK_FLAG);
  if (fs.existsSync(flagPath)) {
    fs.unlinkSync(flagPath);
  }
}

class GpuCrashMonitorService {
  private crashCount = 0;
  private initialized = false;
  private relaunching = false;

  initialize(): void {
    if (this.initialized) return;
    this.initialized = true;

    const userDataPath = app.getPath("userData");
    const alreadyDisabled = isGpuDisabledByFlag(userDataPath);
    const alreadyHasAngleFallback = isGpuAngleFallbackByFlag(userDataPath);

    app.on("child-process-gone", async (_event, details) => {
      if (details.type !== "GPU") {
        if (details.reason !== "clean-exit" && details.reason !== "killed") {
          console.warn(
            `[ChildProcess] Process gone: type=${details.type}, reason=${details.reason}, exitCode=${details.exitCode}, name=${details.name}`
          );
        }
        return;
      }
      if (details.reason === "clean-exit" || details.reason === "killed") return;

      this.crashCount++;
      console.warn(
        `[GPU] GPU process crash #${this.crashCount}: reason=${details.reason}, exitCode=${details.exitCode}`
      );

      if (this.relaunching || alreadyDisabled) return;

      // First-strike soft fallback: when the system has not yet been moved to
      // ANGLE/Vulkan, the first crash relaunches with the fallback flags. The
      // `alreadyHasAngleFallback` guard prevents an infinite relaunch loop on
      // hardware where Vulkan itself crashes — in that case the strikes
      // accumulate normally toward the nuclear path below.
      if (this.crashCount === 1 && !alreadyHasAngleFallback) {
        this.relaunching = true;
        console.error("[GPU] First GPU crash — writing ANGLE fallback flag and relaunching");
        try {
          writeGpuAngleFallbackFlag(userDataPath);
        } catch (err) {
          console.error("[GPU] Failed to write ANGLE fallback flag:", err);
        }
        app.relaunch();
        await closeTelemetry();
        app.exit(0);
        return;
      }

      if (this.crashCount >= GPU_CRASH_THRESHOLD) {
        this.relaunching = true;
        console.error(
          `[GPU] ${GPU_CRASH_THRESHOLD} GPU crashes detected — writing disable flag and relaunching`
        );
        try {
          writeGpuDisabledFlag(userDataPath);
          clearGpuAngleFallbackFlag(userDataPath);
          store.set("gpu", { hardwareAccelerationDisabled: true });
        } catch (err) {
          console.error("[GPU] Failed to write disable flag:", err);
        }
        app.relaunch();
        await closeTelemetry();
        app.exit(0);
      }
    });

    if (alreadyDisabled) {
      console.log("[GPU] Hardware acceleration disabled by crash fallback flag");
    } else if (alreadyHasAngleFallback) {
      console.log("[GPU] ANGLE/Vulkan fallback active from previous crash");
    }
  }
}

let instance: GpuCrashMonitorService | null = null;

export function getGpuCrashMonitorService(): GpuCrashMonitorService {
  if (!instance) {
    instance = new GpuCrashMonitorService();
  }
  return instance;
}

export function initializeGpuCrashMonitor(): GpuCrashMonitorService {
  const service = getGpuCrashMonitorService();
  service.initialize();
  return service;
}
