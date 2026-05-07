export function isElectronUpdaterSupported(platform?: NodeJS.Platform): boolean {
  return (platform ?? process.platform) !== "win32";
}
