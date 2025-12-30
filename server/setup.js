/**
 * Setup Script for LMArena - Direct Chrome Launch
 * Launches Chrome directly (not through Puppeteer) to avoid automation detection.
 * This allows normal OAuth login to work.
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// Profile directory - MUST match server/browser.js path
const userDataDir = path.join(__dirname, '..', 'chrome-profile');

// Find Chrome executable
function getChromeExecutablePath() {
    const candidates = [
        process.env.CHROME_PATH,
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
    ].filter(Boolean);

    for (const p of candidates) {
        if (fs.existsSync(p)) return p;
    }
    return 'chrome'; // fallback to PATH
}

async function setup() {
    console.log('\n========================================');
    console.log('  LMArena Browser Setup');
    console.log('========================================\n');
    console.log('This will launch a NORMAL Chrome window.');
    console.log('(No automation flags - login should work!)\n');
    console.log('Please complete the following:\n');
    console.log('  1. Log in to lmarena.ai (Google/GitHub)');
    console.log('  2. Accept the Terms of Service');
    console.log('  3. Make sure you can chat normally\n');
    console.log('Your session will be saved for automation.\n');

    // Ensure profile directory exists
    if (!fs.existsSync(userDataDir)) {
        fs.mkdirSync(userDataDir, { recursive: true });
    }

    const chromePath = getChromeExecutablePath();
    console.log(`[Setup] Launching Chrome: ${chromePath}`);
    console.log(`[Setup] Profile: ${userDataDir}\n`);

    // Launch Chrome directly - NO automation flags
    const chrome = spawn(chromePath, [
        `--user-data-dir=${userDataDir}`,
        '--no-first-run',
        '--no-default-browser-check',
        'https://lmarena.ai/'
    ], {
        detached: true,
        stdio: 'ignore'
    });

    chrome.unref();

    console.log('========================================');
    console.log('Chrome is now open (normal mode).');
    console.log('Complete login/ToS, then close Chrome.');
    console.log('========================================\n');

    rl.question('Press ENTER after you close Chrome... ', async () => {
        console.log('\n========================================');
        console.log('Setup complete!');
        console.log('Your session is saved in: chrome-profile/');
        console.log('Now run: npm run server');
        console.log('========================================\n');

        rl.close();
        process.exit(0);
    });
}

setup();
