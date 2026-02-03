/**
 * sync-camera.js
 * Pre-build script that syncs camera settings from camera-settings.json to cameraDefaults.ts
 * 
 * Run manually: node scripts/sync-camera.js
 * Runs automatically before build: npm run build
 */

const fs = require('fs');
const path = require('path');

const SETTINGS_FILE = path.join(__dirname, '..', 'camera-settings.json');
const INTRO_SETTINGS_FILE = path.join(__dirname, '..', 'camera-intro-settings.json');
const DEFAULTS_FILE = path.join(__dirname, '..', 'src', 'config', 'cameraDefaults.ts');

function readSettings(filePath, label) {
    if (!fs.existsSync(filePath)) {
        console.log(`📷 No ${label} settings found at ${filePath}`);
        return null;
    }
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(content);
    } catch (err) {
        console.error(`❌ Failed to parse ${label} settings:`, err.message);
        return null;
    }
}

function main() {
    const gameplaySettings = readSettings(SETTINGS_FILE, 'gameplay');
    const introSettings = readSettings(INTRO_SETTINGS_FILE, 'intro');

    if (!gameplaySettings && !introSettings) {
        console.log('📷 No camera settings found - skipping update');
        return;
    }

    let newContent = `// src/config/cameraDefaults.ts
// These are the default camera settings used when no localStorage data exists.
// Update these values to change the default camera view for production builds.
// Press Shift+C for Gameplay or Shift+B for Intro to save current values.

`;

    const effectiveIntro = introSettings || gameplaySettings;

    if (gameplaySettings) {
        newContent += `export const CAMERA_DEFAULTS = {
    alpha: ${gameplaySettings.alpha.toFixed(2)},
    beta: ${gameplaySettings.beta.toFixed(2)},
    radius: ${gameplaySettings.radius.toFixed(2)},
    targetX: ${gameplaySettings.targetX.toFixed(1)},
    targetY: ${gameplaySettings.targetY.toFixed(1)},
    targetZ: ${gameplaySettings.targetZ.toFixed(1)},
    fov: ${gameplaySettings.fov.toFixed(2)},
};

`;
    }

    if (effectiveIntro) {
        newContent += `export const INTRO_CAMERA_DEFAULTS = {
    alpha: ${effectiveIntro.alpha.toFixed(2)},
    beta: ${effectiveIntro.beta.toFixed(2)},
    radius: ${effectiveIntro.radius.toFixed(2)},
    targetX: ${effectiveIntro.targetX.toFixed(1)},
    targetY: ${effectiveIntro.targetY.toFixed(1)},
    targetZ: ${effectiveIntro.targetZ.toFixed(1)},
    fov: ${effectiveIntro.fov.toFixed(2)},
};
`;
    }

    try {
        fs.writeFileSync(DEFAULTS_FILE, newContent, 'utf8');
        console.log('✅ Updated cameraDefaults.ts successfully');
    } catch (err) {
        console.error('❌ Failed to write cameraDefaults.ts:', err.message);
        process.exit(1);
    }
}

main();
