/**
 * Browser Control Module
 * Uses puppeteer.launch() with stealth plugin for Cloudflare bypass.
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// Enable stealth plugin - MUST use puppeteer.launch() for this to work
puppeteer.use(StealthPlugin());

class BrowserController {
    constructor() {
        this.browser = null;
        this.page = null;
        this.isReady = false;
        this.launchPromise = null;

        this.chromeProfileDirectory = process.env.CHROME_PROFILE_DIRECTORY || 'Profile 3';

        // Source profile to copy from
        const chromeUserDataRoot =
            process.env.CHROME_USER_DATA_ROOT ||
            (process.env.LOCALAPPDATA
                ? path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'User Data')
                : 'C:\\Users\\lenno\\AppData\\Local\\Google\\Chrome\\User Data');
        this.chromeUserDataRoot = chromeUserDataRoot;
        this.sourceProfile = path.join(chromeUserDataRoot, this.chromeProfileDirectory);

        // Dedicated automation profile (persistent)
        this.userDataDir = path.join(__dirname, '..', 'chrome-profile');
    }

    isAnyChromeRunning() {
        try {
            const output = execSync(
                'powershell -NoProfile -Command "(Get-Process chrome -ErrorAction SilentlyContinue | Select-Object -First 1) -ne $null"',
                { stdio: 'pipe' }
            ).toString();
            return output.toLowerCase().includes('true');
        } catch (_e) {
            return false;
        }
    }

    async killChrome() {
        try {
            console.log('[Browser] Killing any existing Chrome processes...');
            execSync('taskkill /F /IM chrome.exe /T 2>nul', { stdio: 'pipe' });
        } catch (e) { /* ignore */ }

        // Wait for Chrome to die
        for (let i = 0; i < 6; i++) {
            await new Promise((r) => setTimeout(r, 300));
            if (!this.isAnyChromeRunning()) {
                console.log('[Browser] Chrome closed');
                return;
            }
        }
    }

    copyProfile() {
        const destProfile = path.join(this.userDataDir, 'Default');

        // Only copy if this is the first time
        if (fs.existsSync(path.join(destProfile, 'Cookies'))) {
            return;
        }

        console.log('[Browser] First run - seeding profile from Chrome Profile 3...');

        if (!fs.existsSync(destProfile)) {
            fs.mkdirSync(destProfile, { recursive: true });
        }

        const filesToCopy = [
            'Cookies', 'Cookies-journal', 'Login Data', 'Login Data-journal',
            'Web Data', 'Web Data-journal', 'Preferences', 'Secure Preferences',
        ];

        const dirsToCopy = ['Local Storage', 'Session Storage', 'IndexedDB', 'Network'];

        for (const file of filesToCopy) {
            const src = path.join(this.sourceProfile, file);
            const dest = path.join(destProfile, file);
            try {
                if (fs.existsSync(src)) fs.copyFileSync(src, dest);
            } catch (err) {
                console.log(`[Browser] Could not copy ${file}: ${err.message}`);
            }
        }

        // Copy Local State from the Chrome root
        try {
            const localStateSrc = path.join(this.sourceProfile, '..', 'Local State');
            const localStateDest = path.join(this.userDataDir, 'Local State');
            if (fs.existsSync(localStateSrc)) fs.copyFileSync(localStateSrc, localStateDest);
        } catch (err) {
            console.log('[Browser] Could not copy Local State:', err.message);
        }

        for (const dir of dirsToCopy) {
            const src = path.join(this.sourceProfile, dir);
            const dest = path.join(destProfile, dir);
            try {
                if (fs.existsSync(src)) this.copyDirSync(src, dest);
            } catch (err) {
                console.log(`[Browser] Could not copy ${dir}: ${err.message}`);
            }
        }
    }

    copyDirSync(src, dest) {
        if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
        const entries = fs.readdirSync(src, { withFileTypes: true });
        for (const entry of entries) {
            const srcPath = path.join(src, entry.name);
            const destPath = path.join(dest, entry.name);
            try {
                if (entry.isDirectory()) {
                    this.copyDirSync(srcPath, destPath);
                } else {
                    fs.copyFileSync(srcPath, destPath);
                }
            } catch (_err) { /* Skip locked files */ }
        }
    }

    getChromeExecutablePath() {
        const candidates = [
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        ];
        for (const c of candidates) {
            if (fs.existsSync(c)) return c;
        }
        return candidates[0];
    }

    getDefaultArenaUrl() {
        return 'https://lmarena.ai/?mode=direct&model=gemini-3-pro&chat-modality=text';
    }

    async launch(headless = false) {
        if (this.launchPromise) return this.launchPromise;

        this.launchPromise = (async () => {
            // Seed profile on first run
            this.copyProfile();

            // Kill any existing Chrome to avoid profile lock
            if (this.isAnyChromeRunning()) {
                console.log('[Browser] Closing existing Chrome...');
                await this.killChrome();
            }

            console.log('[Browser] Launching Chrome with stealth plugin...');
            console.log('[Browser] Profile: ' + this.userDataDir);

            // Launch with minimal flags - stealth plugin handles evasion
            // NO visible automation flags that Chrome will warn about
            this.browser = await puppeteer.launch({
                headless: headless ? 'new' : false,
                executablePath: this.getChromeExecutablePath(),
                userDataDir: this.userDataDir,
                args: [
                    '--window-size=1400,900',
                    '--no-first-run',
                    '--no-default-browser-check',
                ],
                defaultViewport: null,
                // Only ignore --enable-automation (handled by stealth plugin)
                ignoreDefaultArgs: ['--enable-automation'],
            });

            const pages = await this.browser.pages();
            this.page = pages.length > 0 ? pages[0] : await this.browser.newPage();

            // NOTE: We don't clear cookies anymore - it breaks authentication

            // Additional anti-detection
            await this.page.evaluateOnNewDocument(() => {
                // Hide webdriver
                Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

                // Fake plugins array (real browsers have plugins)
                Object.defineProperty(navigator, 'plugins', {
                    get: () => [
                        { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer' },
                        { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' },
                        { name: 'Native Client', filename: 'internal-nacl-plugin' }
                    ]
                });

                // Proper languages
                Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });

                // Chrome-specific properties
                window.chrome = { runtime: {}, loadTimes: () => { }, csi: () => { } };

                // Permissions API spoofing
                const originalQuery = window.navigator.permissions.query;
                window.navigator.permissions.query = (parameters) => (
                    parameters.name === 'notifications' ?
                        Promise.resolve({ state: Notification.permission }) :
                        originalQuery(parameters)
                );
            });

            // Set a realistic user agent
            await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

            // Navigate to arena
            const currentUrl = this.page.url();
            if (!currentUrl.includes('lmarena.ai')) {
                console.log('[Browser] Navigating to LMArena...');
                await this.page.goto(this.getDefaultArenaUrl(), {
                    waitUntil: 'domcontentloaded',
                    timeout: 30000
                });
            }

            this.isReady = true;
            console.log('[Browser] Browser ready (stealth enabled)');
            return this.page;
        })();

        try {
            return await this.launchPromise;
        } catch (error) {
            console.error('[Browser] Launch error:', error.message);
            throw error;
        } finally {
        }
    }

    /**
     * Start background human presence (random mouse movements)
     * This helps prevent Cloudflare from flagging the session as idle/bot
     */
    startHumanPresence() {
        if (this.presenceInterval) clearInterval(this.presenceInterval);

        this.presenceInterval = setInterval(async () => {
            if (!this.page || !this.browser) return;

            try {
                // Only move if we are not actively navigating
                const isStable = await this.page.evaluate(() => !document.querySelector('.loading-overlay'));
                if (isStable) {
                    const width = 1200;
                    const height = 800;
                    const x = Math.floor(Math.random() * width);
                    const y = Math.floor(Math.random() * height);

                    // Simple "nervous" movement or "idle" meander
                    await this.page.mouse.move(x, y, { steps: 25 });
                }
            } catch (e) {
                // Ignore errors (page might be closed/loading)
            }
        }, 15000 + Math.random() * 10000); // Every 15-25 seconds
    }

    /**
     * Try to find and click captcha checkbox using direct DOM click
     */
    async trySolveCaptcha() {
        if (!this.page) return false;

        try {
            // Check all iframes for reCAPTCHA
            const frames = this.page.frames();
            for (const frame of frames) {
                const url = frame.url();

                // Google reCAPTCHA iframe
                if (url.includes('google.com/recaptcha') || url.includes('recaptcha/enterprise')) {
                    console.log('[Browser] Found reCAPTCHA iframe, attempting click...');

                    // First check if already solved
                    const alreadySolved = await frame.evaluate(() => {
                        const anchor = document.querySelector('#recaptcha-anchor');
                        return anchor && anchor.getAttribute('aria-checked') === 'true';
                    }).catch(() => false);

                    if (alreadySolved) {
                        console.log('[Browser] reCAPTCHA already solved!');
                        return true;
                    }

                    // Click the checkbox
                    const clicked = await frame.evaluate(() => {
                        const checkbox = document.querySelector('#recaptcha-anchor > div.recaptcha-checkbox-border') ||
                            document.querySelector('.recaptcha-checkbox-border') ||
                            document.querySelector('#recaptcha-anchor');
                        if (checkbox) {
                            checkbox.click();
                            return true;
                        }
                        return false;
                    });

                    if (clicked) {
                        console.log('[Browser] Clicked reCAPTCHA checkbox!');

                        // Wait a moment and verify it worked
                        await new Promise(r => setTimeout(r, 1000));

                        const verified = await frame.evaluate(() => {
                            const anchor = document.querySelector('#recaptcha-anchor');
                            return anchor && anchor.getAttribute('aria-checked') === 'true';
                        }).catch(() => false);

                        if (verified) {
                            console.log('[Browser] reCAPTCHA verification SUCCESS!');
                            return true;
                        } else {
                            console.log('[Browser] reCAPTCHA click did not verify - checking for image puzzle...');

                            // Check if an image challenge appeared
                            await new Promise(r => setTimeout(r, 500));
                            const hasPuzzle = await this.page.evaluate(() => {
                                // Look for the bframe (challenge iframe)
                                const bframe = document.querySelector('iframe[title*="challenge"]') ||
                                    document.querySelector('iframe[src*="bframe"]');
                                return !!bframe;
                            }).catch(() => false);

                            if (hasPuzzle) {
                                console.log('[Browser] ⚠️ IMAGE PUZZLE DETECTED - Please solve manually in browser');
                                // Return true to stop retrying - user needs to solve manually
                                return true;
                            }
                        }
                    }
                }

                // Cloudflare Turnstile
                if (url.includes('challenges.cloudflare.com') || url.includes('turnstile')) {
                    const clicked = await frame.evaluate(() => {
                        const el = document.querySelector('input[type="checkbox"]') ||
                            document.querySelector('[role="checkbox"]');
                        if (el) {
                            el.click();
                            return true;
                        }
                        return false;
                    });

                    if (clicked) {
                        console.log('[Browser] Clicked Cloudflare checkbox!');
                        return true;
                    }
                }
            }
        } catch (e) {
            console.log('[Browser] Captcha solve error:', e.message);
        }

        return false;
    }

    /**
     * Wait for Cloudflare/Security checks to complete.
     * We do NOT try to auto-solve. We wait for the user.
     */
    async waitForCloudflare(maxWaitMs = 600000) { // 10 minutes wait time
        if (!this.page) return true;

        const startTime = Date.now();
        let notedBlock = false;

        while (Date.now() - startTime < maxWaitMs) {
            try {
                // Check page status
                const status = await this.page.evaluate(() => {
                    // 1. Success indicator
                    if (document.querySelector('textarea')) {
                        return 'ready';
                    }

                    // 2. Block indicators
                    const title = document.title.toLowerCase();
                    const bodyText = document.body.innerText.toLowerCase();

                    const isCloudflare = title.includes('just a moment') ||
                        document.querySelector('#challenge-running') ||
                        document.querySelector('[data-ray]');

                    const isRecaptcha = !!document.querySelector('iframe[title*="reCAPTCHA"]');
                    const isSecurity = bodyText.includes('security verification');

                    if (isCloudflare || isRecaptcha || isSecurity) {
                        return 'blocked';
                    }

                    // 3. Loading (default)
                    return 'loading';
                });

                if (status === 'ready') {
                    if (notedBlock) console.log('[Browser] Challenge resolved! Resuming...');
                    return true;
                }

                if (status === 'blocked') {
                    if (!notedBlock) {
                        console.log('[Browser] Security check detected. Attempting to auto-solve...');
                        notedBlock = true;
                    }
                    // Try to solve immediately using direct DOM click
                    await this.trySolveCaptcha();
                }

                await new Promise((r) => setTimeout(r, 1000));
            } catch (e) {
                // Ignore context errors, just wait
                await new Promise((r) => setTimeout(r, 1000));
            }
        }

        console.log('[Browser] Timed out waiting for security check resolution.');
        return false;
    }

    async getPage() {
        if (!this.browser || !this.page) {
            await this.launch();
        }

        try {
            await this.page.title();
        } catch (_error) {
            console.log('[Browser] Page invalid, relaunching...');
            await this.launch();
        }

        return this.page;
    }

    async close() {
        try {
            if (this.browser) {
                await this.browser.close();
            }
        } catch (error) {
            console.error('[Browser] Error closing:', error.message);
        } finally {
            this.browser = null;
            this.page = null;
            this.isReady = false;
            this.launchPromise = null;
        }
    }

    async restart() {
        await this.close();
        return await this.launch();
    }
}

module.exports = new BrowserController();
