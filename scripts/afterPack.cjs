const path = require('path');
const fs = require('fs');

/**
 * Get the path to unpacked resources for the platform
 */
function getUnpackedResourcesPath(appOutDir, electronPlatformName, appName) {
  if (electronPlatformName === 'darwin') {
    return path.join(appOutDir, `${appName}.app`, 'Contents/Resources/app.asar.unpacked');
  }
  // Windows and Linux
  return path.join(appOutDir, 'resources/app.asar.unpacked');
}

/**
 * electron-builder afterPack hook for handling native modules.
 * This runs after the app is packed but before it's signed/notarized.
 *
 * Validates that node-pty native module is properly unpacked and exists.
 *
 * @param {Object} context - The electron-builder context
 * @param {string} context.appOutDir - The output directory
 * @param {string} context.electronPlatformName - 'darwin', 'linux', or 'win32'
 * @param {Object} context.packager - The packager instance
 */
exports.default = async function afterPack(context) {
  const { appOutDir, electronPlatformName, packager } = context;
  const appName = packager.appInfo.productFilename;

  console.log(`[afterPack] Platform: ${electronPlatformName}`);
  console.log(`[afterPack] Output directory: ${appOutDir}`);

  // Get platform-specific unpacked resources path
  const unpackedPath = getUnpackedResourcesPath(appOutDir, electronPlatformName, appName);
  const nodePtyPath = path.join(unpackedPath, 'node_modules/node-pty');

  // Verify node-pty exists
  if (!fs.existsSync(nodePtyPath)) {
    throw new Error(
      `[afterPack] CRITICAL: node-pty not found at ${nodePtyPath}. ` +
      'Terminal functionality will not work. Check asarUnpack configuration.'
    );
  }

  console.log(`[afterPack] node-pty found at: ${nodePtyPath}`);

  // Verify the native binary exists
  const nativeBinaryPath = path.join(nodePtyPath, 'build/Release/pty.node');
  if (!fs.existsSync(nativeBinaryPath)) {
    throw new Error(
      `[afterPack] CRITICAL: node-pty native binary not found at ${nativeBinaryPath}. ` +
      'Run "npm run rebuild" to build the native module.'
    );
  }

  console.log(`[afterPack] Native binary verified: ${nativeBinaryPath}`);

  // On macOS, native modules will be signed during the code signing phase
  if (electronPlatformName === 'darwin') {
    console.log('[afterPack] Native modules will be signed during code signing phase');
  }

  console.log('[afterPack] Complete - all native modules validated');
};
