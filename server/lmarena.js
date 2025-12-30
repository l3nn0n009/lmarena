/**
 * LMArena Interaction Module
 * Handles all interactions with lmarena.ai
 */

const browserController = require('./browser');

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
// Randomized delay to appear more human (bots have consistent timing)
const randomDelay = (min, max) => delay(min + Math.random() * (max - min));

// Comprehensive model configurations
const MODEL_CONFIG = {
    // Text Models
    'gemini-3-pro': { modality: 'text', displayName: 'Gemini 3 Pro' },
    'gemini-3-flash': { modality: 'text', displayName: 'Gemini 3 Flash' },
    'gpt-5.2-high': { modality: 'text', displayName: 'GPT 5.2 High' },
    'gpt-5.2': { modality: 'text', displayName: 'GPT 5.2' },
    'gpt-5.1-high': { modality: 'text', displayName: 'GPT 5.1 High' },
    'gpt-5.1': { modality: 'text', displayName: 'GPT 5.1' },
    'o3-2025-04-16': { modality: 'text', displayName: 'o3' },
    'claude-opus-4-5-20251101-thinking-32k': { modality: 'text', displayName: 'Claude Opus 4.5 Thinking' },
    'claude-opus-4-5-20251101': { modality: 'text', displayName: 'Claude Opus 4.5' },
    'claude-sonnet-4-5-20250929-thinking-32k': { modality: 'text', displayName: 'Claude Sonnet 4.5 Thinking' },
    'claude-sonnet-4-5-20250929': { modality: 'text', displayName: 'Claude Sonnet 4.5' },
    'deepseek-v3.2-thinking': { modality: 'text', displayName: 'DeepSeek V3.2 Thinking' },
    'deepseek-v3.2': { modality: 'text', displayName: 'DeepSeek V3.2' },
    'grok-4.1-thinking': { modality: 'text', displayName: 'Grok 4.1 Thinking' },
    'grok-4.1': { modality: 'text', displayName: 'Grok 4.1' },

    // Image Models
    'gpt-image-1.5': { modality: 'image', displayName: 'GPT Image 1.5' },
    'gpt-image-1': { modality: 'image', displayName: 'GPT Image 1' },
    'gemini-3-pro-image-preview-2k (nano-banana-pro)': { modality: 'image', displayName: 'Gemini 3 Pro Image' },
    'gemini-2.5-flash-image-preview (nano-banana)': { modality: 'image', displayName: 'Gemini 2.5 Flash Image' },
    'dall-e-3': { modality: 'image', displayName: 'DALL-E 3' },
    'flux-2-max': { modality: 'image', displayName: 'FLUX 2 Max' },
    'flux-2-pro': { modality: 'image', displayName: 'FLUX 2 Pro' },
    'recraft-v3': { modality: 'image', displayName: 'Recraft V3' },

    // Search Models
    'gemini-3-pro-grounding': { modality: 'search', displayName: 'Gemini 3 Pro (Grounding)' },
    'gemini-2.5-pro-grounding': { modality: 'search', displayName: 'Gemini 2.5 Pro (Grounding)' },
    'gpt-5.2-search': { modality: 'search', displayName: 'GPT 5.2 Search' },
    'gpt-5.1-search': { modality: 'search', displayName: 'GPT 5.1 Search' },
    'gpt-5.1-search-sp': { modality: 'search', displayName: 'GPT 5.1 Search SP' },
    'gpt-5-search': { modality: 'search', displayName: 'GPT 5 Search' },
    'o3-search': { modality: 'search', displayName: 'o3 Search' },
    'grok-4-1-fast-search': { modality: 'search', displayName: 'Grok 4.1 Fast Search' },
    'grok-4-fast-search': { modality: 'search', displayName: 'Grok 4 Fast Search' },
    'grok-4-search': { modality: 'search', displayName: 'Grok 4 Search' },
    'claude-opus-4-1-search': { modality: 'search', displayName: 'Claude Opus 4.1 Search' },
    'claude-opus-4-search': { modality: 'search', displayName: 'Claude Opus 4 Search' },
    'ppl-sonar-reasoning-pro-high': { modality: 'search', displayName: 'Perplexity Sonar Reasoning Pro' },
    'ppl-sonar-pro-high': { modality: 'search', displayName: 'Perplexity Sonar Pro' },
    'diffbot-small-xl': { modality: 'search', displayName: 'Diffbot Small XL' },
};

class LMArenaController {
    constructor() {
        this.page = null;
        this.isInitialized = false;
        this.initializingPromise = null;
        this.currentModel = null;
        this.currentModality = 'text';
        this.baseUrl = 'https://lmarena.ai';
        this.onTokenCallback = null;
    }

    async uploadImage(base64Data) {
        if (!this.page) throw new Error("Page not initialized");

        console.log('[LMArena] Uploading image...');

        await this.page.evaluate((data) => {
            // Add prefix if missing
            if (!data.startsWith("data:image")) {
                data = "data:image/png;base64," + data;
            }

            // Convert base64 -> Blob
            const arr = data.split(",");
            const mime = arr[0].match(/:(.*?);/)[1];
            const bstr = atob(arr[1]);
            let n = bstr.length;
            const u8 = new Uint8Array(n);
            while (n--) u8[n] = bstr.charCodeAt(n);
            const blob = new Blob([u8], { type: mime });

            // Create File object
            const file = new File([blob], "upload.png", { type: mime });

            // Find LM Arena's hidden file input
            // Usually it's an input[type="file"] that accepts images
            const input = document.querySelector('input[type="file"][accept*="image"]');

            if (!input) {
                console.error("File input not found");
                return false;
            }

            // Inject file into input
            const dt = new DataTransfer();
            dt.items.add(file);
            input.files = dt.files;

            // Fire change event so LM Arena reacts
            input.dispatchEvent(new Event("change", { bubbles: true }));
            return true;
        }, base64Data);

        console.log('[LMArena] Image uploaded successfully');
        await delay(1000); // Wait for upload to process
        return true;
    }

    buildUrl(model = null, modality = 'text') {
        let detectedModality = modality;
        if (model && MODEL_CONFIG[model]) {
            detectedModality = MODEL_CONFIG[model].modality;
        } else if (model) {
            const m = model.toLowerCase();
            if (m.includes('image') || m.includes('flux') || m.includes('imagen') || m.includes('dall-e') || m.includes('reve') || m.includes('photon') || m.includes('recraft') || m.includes('ideogram')) {
                detectedModality = 'image';
            } else if (m.includes('search') || m.includes('grounding') || m.includes('sonar') || m.includes('diffbot')) {
                detectedModality = 'search';
            }
        }

        // Match the exact order requested by user: mode, model, chat-modality
        let url = `${this.baseUrl}/?mode=direct`;
        if (model) {
            url += `&model=${encodeURIComponent(model)}`;
        }
        if (detectedModality === 'image') {
            url += '&chat-modality=image';
        } else if (detectedModality === 'search') {
            url += '&chat-modality=search';
        } else {
            url += '&chat-modality=text';
        }

        return { url, modality: detectedModality };
    }

    async safeGoto(url, options = { waitUntil: 'networkidle2', timeout: 60000 }) {
        console.log(`[LMArena] Navigating to: ${url}`);
        try {
            await this.page.goto(url, options);
            console.log(`[LMArena] Successfully navigated to: ${this.page.url()}`);
            // Small random delay like a human loading the page
            await randomDelay(200, 500);
        } catch (error) {
            if (error.message.includes('net::ERR_ABORTED')) {
                console.warn('[LMArena] Navigation aborted, but continuing...', error.message);
                await randomDelay(500, 1000);
                return;
            }
            throw error;
        }
    }

    async initialize(model = null) {
        if (this.isInitialized) {
            return { model: this.currentModel, modality: this.currentModality };
        }

        if (this.initializingPromise) {
            return await this.initializingPromise;
        }

        this.initializingPromise = (async () => {
            console.log('[LMArena] Initializing...');
            console.log('[LMArena] Getting browser page...');
            this.page = await browserController.getPage();

            if (!this.page) {
                throw new Error('Failed to get browser page');
            }
            console.log('[LMArena] Got browser page successfully');

            const { url, modality } = this.buildUrl(model);
            await this.safeGoto(url);
            console.log(`[LMArena] Navigation complete. Modality: ${modality}`);

            // DON'T check for anything here - just wait like a human would
            // The captcha/ToS checks only happen when user actually sends a message

            // Start subtle background movements after a delay (like reading the page)
            setTimeout(() => browserController.startHumanPresence(), 3000);

            this.currentModel = model;
            this.currentModality = modality;
            this.isInitialized = true;

            console.log('[LMArena] Initialized successfully (no proactive checks)');
            return { model: this.currentModel, modality: this.currentModality };
        })();

        try {
            return await this.initializingPromise;
        } catch (error) {
            console.error('[LMArena] Initialize error:', error.message);
            console.error('[LMArena] Stack:', error.stack);
            throw error;
        } finally {
            this.initializingPromise = null;
        }
    }

    async acceptToS() {
        console.log('[LMArena] Checking for ToS dialog...');

        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                const result = await this.page.evaluate(() => {
                    const dialogs = document.querySelectorAll('[role="dialog"], .modal, form');
                    let clickedCheckbox = false;

                    for (const dialog of dialogs) {
                        const checkboxes = dialog.querySelectorAll('input[type="checkbox"]');
                        checkboxes.forEach(cb => {
                            if (!cb.checked) {
                                cb.click();
                                clickedCheckbox = true;
                            }
                        });

                        const buttons = dialog.querySelectorAll('button');
                        for (const btn of buttons) {
                            const text = (btn.textContent || '').toLowerCase().trim();
                            if (text === 'i agree' || text === 'agree' ||
                                text === 'accept' || text === 'i accept') {
                                btn.click();
                                return 'agreed';
                            }
                        }
                    }

                    const allButtons = document.querySelectorAll('button');
                    for (const btn of allButtons) {
                        const text = (btn.textContent || '').toLowerCase().trim();
                        if (text === 'i agree' || text === 'agree' || text === 'i accept') {
                            btn.click();
                            return 'agreed';
                        }
                    }

                    return clickedCheckbox ? 'checkboxes' : 'none';
                });

                console.log(`[LMArena] ToS check result: ${result}`);

                if (result === 'agreed') {
                    await delay(1000);
                    break;
                } else if (result === 'checkboxes') {
                    await delay(500);
                } else {
                    break;
                }
            } catch (e) {
                console.log('[LMArena] ToS check error:', e.message);
            }
        }

        console.log('[LMArena] ToS check complete');
    }

    async selectModel(modelName) {
        if (!this.isInitialized) {
            return await this.initialize(modelName);
        }

        const { url, modality } = this.buildUrl(modelName);

        console.log(`[LMArena] Switching to model: ${modelName} (${modality})`);
        await this.safeGoto(url);

        // No proactive checks - just navigate and wait

        this.currentModel = modelName;
        this.currentModality = modality;

        // Extract model icon after loading
        const iconData = await this.getModelIcon();

        return { success: true, iconUrl: iconData };
    }

    /**
     * Extract the current model's icon SVG from lmarena as a data URI
     * Uses the same approach as the user's script to find the model selector button's SVG
     */
    async getModelIcon() {
        try {
            const iconDataUri = await this.page.evaluate(() => {
                // Find the header container with the model selector button
                const headerContainer = document.querySelector(
                    "#chat-area > div.bg-surface-primary.border-border-faint.flex-shrink-0.border-b " +
                    "> div.hidden.h-12.items-center.justify-between.gap-2.px-4.md\\:flex " +
                    "> div.flex.min-w-0.items-center.justify-start.gap-2"
                );

                if (!headerContainer) return null;

                // Get the 2nd button (model selector - 1st is "Direct Chat")
                const buttons = headerContainer.querySelectorAll('button');
                if (buttons.length < 2) return null;

                const targetButton = buttons[1];
                const svgElement = targetButton.querySelector('svg');

                if (!svgElement) return null;

                // Serialize SVG to string
                const serializer = new XMLSerializer();
                let source = serializer.serializeToString(svgElement);

                // Add namespaces for valid standalone SVG
                if (!source.match(/^<svg[^>]+xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)) {
                    source = source.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
                }
                if (!source.match(/^<svg[^>]+xmlns:xlink/)) {
                    source = source.replace(/^<svg/, '<svg xmlns:xlink="http://www.w3.org/1999/xlink"');
                }

                // Create Data URI
                return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`;
            });

            if (iconDataUri) {
                console.log('[LMArena] Extracted model icon successfully');
            }
            return iconDataUri;
        } catch (error) {
            console.log('[LMArena] Could not extract model icon:', error.message);
            return null;
        }
    }

    async navigateToChat(chatId) {
        if (!this.isInitialized) throw new Error('Not initialized');

        const url = chatId
            ? `https://lmarena.ai/c/${chatId}`
            : this.buildUrl(this.currentModel, this.currentModality);

        console.log(`[LMArena] Navigating to chat: ${chatId || 'New Chat'} (${url})`);
        try {
            await this.safeGoto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        } catch (e) {
            console.error('[LMArena] Navigation error:', e.message);
        }

        await delay(300);
        await this.acceptToS();

        return true;
    }

    async sendMessage(message, onToken = null) {
        if (!this.isInitialized) {
            throw new Error('LMArena not initialized');
        }

        console.log(`[LMArena] Sending message: ${message.substring(0, 50)}...`);
        this.onTokenCallback = onToken;
        this.lastMessage = message; // Store for observer re-initialization
        this.captchaSolved = false;  // Reset captcha flag for new message

        const maxRetries = 3;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                // Get fresh page reference in case of navigation/crash
                if (attempt > 1) {
                    console.log(`[LMArena] Retry attempt ${attempt}/${maxRetries}...`);
                    try {
                        this.page = await browserController.getPage();
                    } catch (e) { /* ignore */ }
                }

                // Quick check for Cloudflare (don't wait for navigation unless needed)
                console.log('[LMArena] Checking page readiness...');

                // Only wait for navigation if page is actually navigating
                const isNavigating = await this.page.evaluate(() => document.readyState !== 'complete').catch(() => false);
                if (isNavigating) {
                    await this.page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 5000 }).catch(() => { });
                }

                // Quick Cloudflare check (5 second timeout, not 10 minutes)
                await browserController.waitForCloudflare(5000);

                // Find textarea immediately
                let textarea = null;
                try {
                    await this.page.waitForSelector('textarea', { timeout: 5000 });
                    textarea = await this.page.$('textarea');
                } catch (e) {
                    console.log('[LMArena] Textarea not found, waiting...');
                    await delay(1000);
                    textarea = await this.page.$('textarea');
                }

                if (!textarea) {
                    throw new Error('Could not find textarea on page after retries');
                }

                // Focus and clear previous (optional)
                await textarea.click({ clickCount: 3 });

                // Check if this is an image edit request
                const imgMatch = message.match(/EDIT IMAGE \((.*?)\):\s*(.*)/);
                if (imgMatch) {
                    const imgUrl = imgMatch[1];
                    const prompt = imgMatch[2];

                    console.log(`[LMArena] Pasting image from URL: ${imgUrl}`);

                    // Use the user-provided logic to paste image
                    await this.page.evaluate(async (url, pText) => {
                        const textareaEl = document.querySelector("textarea");
                        if (!textareaEl) return;

                        textareaEl.focus();
                        const res = await fetch(url);
                        const blob = await res.blob();
                        const ext = blob.type.split("/")[1] || "png";
                        const file = new File([blob], "image." + ext, { type: blob.type });

                        const dt = new DataTransfer();
                        dt.items.add(file);

                        const pasteEvent = new ClipboardEvent("paste", {
                            clipboardData: dt,
                            bubbles: true,
                            cancelable: true
                        });

                        textareaEl.dispatchEvent(pasteEvent);

                        // Now set the text
                        textareaEl.value = pText;
                        textareaEl.dispatchEvent(new Event('input', { bubbles: true }));
                    }, imgUrl, prompt);

                    await delay(1000); // Wait for paste to process
                    await this.setupResponseObserver(prompt);
                } else {
                    // Direct DOM manipulation - faster and less error prone than typing
                    // AND React-compatible to ensure verification happens
                    await this.page.evaluate((msg) => {
                        const textarea = document.querySelector('textarea');
                        if (textarea) {
                            textarea.focus();

                            // React 16+ hack: call native value setter to trigger React's internal state update
                            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
                            nativeInputValueSetter.call(textarea, msg);

                            // Dispatch events to wake up validation
                            textarea.dispatchEvent(new Event('input', { bubbles: true }));
                            textarea.dispatchEvent(new Event('change', { bubbles: true }));
                        }
                    }, message);

                    await this.setupResponseObserver(message);
                }

                // Small delay to let React processing catch up
                await delay(300);

                // Click send button instead of Enter (often more reliable)
                const clicked = await this.page.evaluate(() => {
                    const sendBtn = document.querySelector('button[aria-label="Send message"]') ||
                        document.querySelector('button[data-testid="send-button"]') ||
                        Array.from(document.querySelectorAll('button')).find(b => b.innerText === 'Send');
                    if (sendBtn) {
                        sendBtn.click();
                        return true;
                    }
                    return false;
                });

                if (!clicked) {
                    // Fallback to Enter if button not found
                    await this.page.keyboard.press('Enter');
                }

                // Wait for response
                // If a challenge appears AFTER sending, waitForResponse might fail or timeout
                // so we need to handle that possibly in the catch block or loop
                const response = await this.waitForResponse(300000);
                return response;

            } catch (error) {
                console.error(`[LMArena] Attempt ${attempt} error:`, error.message);

                // If context destroyed or navigation failed, retry
                if (error.message.includes('Execution context was destroyed') ||
                    error.message.includes('detached Frame') ||
                    error.message.includes('Target closed')) {

                    console.log('[LMArena] Connection unstable, waiting before retry...');
                    await delay(2000);
                    continue;
                }

                // If we ran out of retries, throw
                if (attempt === maxRetries) throw error;
            }
        }
    }

    async setupResponseObserver(userMessage) {
        await this.page.evaluate(() => {
            // Clear previous observer and polling
            if (window._lmObserver) {
                window._lmObserver.disconnect();
            }
            if (window._lmPollingInterval) {
                clearInterval(window._lmPollingInterval);
            }

            window._lmResponse = '';
            window._lmImageUrl = '';
            window._lmChatId = '';
            window._lmSources = [];

            // Helper function to convert HTML to Markdown
            function cleanMarkdown(htmlElement) {
                if (!htmlElement) return "";
                const clone = htmlElement.cloneNode(true);

                // Remove citation numbers and other UI artifacts
                clone.querySelectorAll('button, .bg-surface-raised, .citation, [data-citation]').forEach(e => e.remove());

                // FIRST: Extract code blocks before they get mangled
                // Look for lmarena's code block structure: div[data-code-block="true"]
                const codeBlocks = [];
                clone.querySelectorAll('[data-code-block="true"]').forEach((block, i) => {
                    // Get the language from the header (e.g., "HTML", "JavaScript")
                    const langSpan = block.querySelector('.text-text-secondary.text-sm.font-medium');
                    const language = langSpan ? langSpan.textContent.trim().toLowerCase() : '';

                    // Get the actual code content from the code element
                    const codeEl = block.querySelector('code');
                    const codeContent = codeEl ? codeEl.textContent : '';

                    // Create a placeholder
                    const placeholder = `__CODE_BLOCK_${i}__`;
                    codeBlocks.push({ placeholder, language, content: codeContent });

                    // Replace the block with placeholder
                    block.outerHTML = placeholder;
                });

                // Also handle standard pre>code blocks
                clone.querySelectorAll('pre > code').forEach((codeEl, i) => {
                    const idx = codeBlocks.length;
                    const placeholder = `__CODE_BLOCK_${idx}__`;
                    const codeContent = codeEl.textContent;

                    // Try to detect language from class
                    const classes = codeEl.className || '';
                    const langMatch = classes.match(/language-(\w+)/);
                    const language = langMatch ? langMatch[1] : '';

                    codeBlocks.push({ placeholder, language, content: codeContent });
                    codeEl.closest('pre').outerHTML = placeholder;
                });

                let text = clone.innerHTML;

                // Convert HTML to Markdown
                text = text.replace(/<h1[^>]*>(.*?)<\/h1>/gi, '\n# $1\n');
                text = text.replace(/<h2[^>]*>(.*?)<\/h2>/gi, '\n## $1\n');
                text = text.replace(/<h3[^>]*>(.*?)<\/h3>/gi, '\n### $1\n');
                text = text.replace(/<h4[^>]*>(.*?)<\/h4>/gi, '\n#### $1\n');
                text = text.replace(/<h5[^>]*>(.*?)<\/h5>/gi, '\n##### $1\n');
                text = text.replace(/<h6[^>]*>(.*?)<\/h6>/gi, '\n###### $1\n');
                text = text.replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**');
                text = text.replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**');
                text = text.replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*');
                text = text.replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*');
                text = text.replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`');
                text = text.replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n');
                text = text.replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n');
                text = text.replace(/<br\s*\/?>/gi, '\n');
                text = text.replace(/<a[^>]*href="(.*?)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)');

                // Cleanup remaining HTML tags
                const temp = document.createElement('div');
                temp.innerHTML = text;
                let result = temp.textContent.trim();

                // Now restore code blocks with proper markdown fencing
                codeBlocks.forEach(({ placeholder, language, content }) => {
                    const langTag = language || '';
                    const fence = '\n```' + langTag + '\n' + content + '\n```\n';
                    result = result.replace(placeholder, fence);
                });

                return result;
            }

            // CRITICAL: Count current AI messages to detect NEW ones
            const countAiMessages = () => {
                const proseElements = Array.from(document.querySelectorAll('.prose'));
                return proseElements.filter(el => !el.closest('.self-end')).length;
            };

            window._lmInitialAiCount = countAiMessages();
            console.log('[Observer] Initial AI message count:', window._lmInitialAiCount);

            // Function to check for AI response (text + images + sources)
            const checkForResponse = () => {
                // Check for rate limit / quota errors (graceful handling)
                // Scan multiple potential error classes and alerts
                const errorEls = Array.from(document.querySelectorAll('.text-interactive-negative, .text-red-600, .text-error, div[role="alert"]'));
                const limitError = errorEls.find(el => {
                    const txt = (el.innerText || el.textContent || '').toLowerCase();
                    return txt.includes('rate limit') ||
                        txt.includes('quota') ||
                        txt.includes('too many requests') ||
                        (txt.includes('reach') && txt.includes('limit')) ||
                        txt.includes('please wait');
                });

                if (limitError) {
                    window._lmResponse = `⚠️ **System Notification**\n\n${limitError.innerText}`;
                    return;
                }

                // Find all prose elements (text messages)
                const proseElements = Array.from(document.querySelectorAll('.prose'));
                // Filter out user messages (inside .self-end)
                const aiMessages = proseElements.filter(el => !el.closest('.self-end'));

                // Only look for NEW messages (more than initial count)
                if (aiMessages.length > window._lmInitialAiCount) {
                    // The NEW message is at index 0 (flex-col-reverse puts newest first)
                    const latestAiMessage = aiMessages[0];

                    // Convert HTML to clean Markdown
                    const markdownText = cleanMarkdown(latestAiMessage);

                    // Get parent container to look for sibling images and sources
                    const messageContainer = latestAiMessage.closest('li') || latestAiMessage.parentElement?.parentElement;

                    // Look for image in the message container
                    let imgSrc = '';
                    if (messageContainer) {
                        // User-provided robust selector
                        const targetSelector = 'img.h-\\[50vh\\].w-\\[50vh\\]';
                        const img = messageContainer.querySelector(targetSelector) ||
                            messageContainer.querySelector('img[alt="Generated image"]') ||
                            messageContainer.querySelector('img[src*="blob:"]');
                        if (img) imgSrc = img.src;
                    }

                    // Look for sources in the message container (LMArena specific format)
                    const sources = [];
                    // Sources extraction placeholder

                    // Update response with markdown
                    window._lmResponse = markdownText;
                    window._lmImageUrl = imgSrc;
                    window._lmSources = sources;

                    // Extract chat ID from URL
                    const urlMatch = window.location.href.match(/\/c\/([a-f0-9-]+)/);
                    if (urlMatch) {
                        window._lmChatId = urlMatch[1];
                    }
                }
            };

            // Poll every 30ms for immediate updates
            window._lmPollingInterval = setInterval(checkForResponse, 30);

            // Also use MutationObserver as backup
            window._lmObserver = new MutationObserver(checkForResponse);
            window._lmObserver.observe(document.body, {
                childList: true,
                subtree: true,
                characterData: true,
                attributes: true
            });
        });
    }

    async waitForResponse(timeout = 60000) {
        const startTime = Date.now();
        let lastResponse = '';
        let lastImage = '';
        let lastSources = '';
        let noChangeCount = 0;
        let chatId = '';

        let loopCounter = 0;

        while (Date.now() - startTime < timeout) {
            // Poll quickly for real-time streaming
            await delay(50);
            loopCounter++;

            // Check for captcha every ~500ms (10 iterations * 50ms)
            if (loopCounter % 10 === 0) {
                try {
                    const captchaStatus = await this.page.evaluate(() => {
                        // Check for recaptcha dialog that's actually visible and blocking
                        const dialog = document.querySelector('div[role="dialog"]');
                        if (dialog) {
                            const hasRecaptcha = dialog.querySelector('iframe[title*="reCAPTCHA"]');
                            const securityText = dialog.innerText.toLowerCase();
                            if (hasRecaptcha || securityText.includes('security verification')) {
                                return 'blocking';
                            }
                        }
                        return 'clear';
                    });

                    if (captchaStatus === 'blocking' && !this.captchaSolved) {
                        console.log('[LMArena] Captcha appeared during response wait! Solving...');
                        try {
                            await browserController.trySolveCaptcha();
                            this.captchaSolved = true;  // Don't try again
                        } catch (solveErr) {
                            // Ignore - frame may have detached
                        }

                        // Wait longer for captcha to fully process and page to reload
                        console.log('[LMArena] Waiting for captcha to process...');
                        await delay(3000);

                        // Wait for page to stabilize
                        try {
                            await this.page.waitForSelector('textarea', { timeout: 10000 });
                        } catch (e) {
                            console.log('[LMArena] Waiting for page reload...');
                            await delay(2000);
                        }

                        // Check if there's already an AI response (captcha was quick)
                        const alreadyResponded = await this.page.evaluate(() => {
                            return window._lmResponse && window._lmResponse.length > 0;
                        }).catch(() => false);

                        if (alreadyResponded) {
                            console.log('[LMArena] AI already responding - continuing...');
                            continue;
                        }

                        // Check if the message was typed but not sent (captcha blocked it)
                        const needsResend = await this.page.evaluate(() => {
                            // Check if textarea has our message (not sent)
                            const textarea = document.querySelector('textarea');
                            const hasMessage = textarea && textarea.value && textarea.value.length > 0;

                            // Check if no AI messages beyond initial count
                            const proseElements = Array.from(document.querySelectorAll('.prose'));
                            const aiMessages = proseElements.filter(el => !el.closest('.self-end'));
                            const noNewResponse = aiMessages.length <= (window._lmInitialAiCount || 0);

                            return hasMessage || noNewResponse;
                        }).catch(() => false);

                        if (needsResend && this.lastMessage) {
                            console.log('[LMArena] Message not sent - resending...');
                            // Click send button again
                            try {
                                const sendButton = await this.page.$('button[type="submit"], button.send-button, button[aria-label*="send" i]');
                                if (sendButton) {
                                    await sendButton.click();
                                } else {
                                    // Fallback: type and submit
                                    const textarea = await this.page.$('textarea');
                                    if (textarea) {
                                        await textarea.click();
                                        await this.page.keyboard.press('Enter');
                                    }
                                }
                            } catch (e) {
                                console.log('[LMArena] Resend click failed:', e.message);
                            }
                        }

                        // Re-initialize observer since page state may have changed
                        console.log('[LMArena] Re-initializing response observer...');
                        try {
                            await this.setupResponseObserver(this.lastMessage || '');
                        } catch (obsErr) {
                            console.log('[LMArena] Observer init warning:', obsErr.message);
                        }

                        // Reset tracking
                        lastResponse = '';
                        noChangeCount = 0;
                        startTime = Date.now(); // Reset timeout
                        continue;
                    }
                } catch (e) {
                    // Ignore evaluation errors - page might be navigating
                    if (e.message.includes('detached Frame')) {
                        // This is expected after captcha solve - wait and continue
                        await delay(1500);
                    }
                }
            }

            let responseData;
            try {
                responseData = await this.page.evaluate(() => ({
                    text: window._lmResponse || '',
                    image: window._lmImageUrl || '',
                    id: window._lmChatId || '',
                    sources: window._lmSources || []
                }));
            } catch (evalErr) {
                // Page may be navigating, wait and retry
                await delay(500);
                continue;
            }

            const { text, image, id, sources } = responseData;

            if (id) chatId = id;

            // Stream tokens as they come in
            if (text !== lastResponse && this.onTokenCallback) {
                const delta = text.slice(lastResponse.length);
                if (delta) {
                    console.log(`[LMArena] Token received (${delta.length} chars): ${delta.substring(0, 30)}...`);
                    this.onTokenCallback({
                        fullText: text,
                        delta: delta,
                        imageUrl: image || null,
                        chatId: chatId,
                        sources: sources
                    });
                }
            }

            // Also notify if image changed
            if (image && image !== lastImage && this.onTokenCallback) {
                this.onTokenCallback({
                    fullText: text,
                    delta: '',
                    imageUrl: image,
                    chatId: chatId,
                    sources: sources
                });
                lastImage = image;
            }

            // Check if response is complete (no change for 1 second)
            const sourcesStr = JSON.stringify(sources);
            if (text === lastResponse && (text.length > 0 || image)) {
                noChangeCount++;
                if (noChangeCount >= 20) {
                    // Build final response
                    let finalResponse = text;

                    // Append image if present
                    if (image) {
                        finalResponse += `\n\n![Generated Image](${image})`;
                    }

                    // Append sources section if present
                    if (sources && sources.length > 0) {
                        finalResponse += '\n\n---\n\n**Sources:**\n';
                        sources.forEach((src, i) => {
                            finalResponse += `${i + 1}. [${src.title}](${src.url})\n`;
                        });
                    }

                    return { response: finalResponse, chatId: chatId, sources: sources };
                }
            } else {
                noChangeCount = 0;
            }

            lastResponse = text;
            lastSources = sourcesStr;
        }

        throw new Error('Response timeout');
    }

    getAvailableModels() {
        return Object.entries(MODEL_CONFIG).map(([id, config]) => ({
            id,
            name: config.displayName || id,
            modality: config.modality
        }));
    }

    async close() {
        await browserController.close();
        this.isInitialized = false;
    }
}

module.exports = new LMArenaController();
