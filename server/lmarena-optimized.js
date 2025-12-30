/**
 * LMArena Optimized Controller v3
 * Maximum performance: SSE interception + aggressive DOM stripping
 */

const browserController = require('./browser');

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Model configurations
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
    'ppl-sonar-reasoning-pro-high': { modality: 'search', displayName: 'Perplexity Sonar Reasoning Pro' },
    'ppl-sonar-pro-high': { modality: 'search', displayName: 'Perplexity Sonar Pro' },
};

class LMArenaOptimized {
    constructor() {
        this.page = null;
        this.isInitialized = false;
        this.initializingPromise = null;
        this.currentModel = null;
        this.currentModality = 'text';
        this.baseUrl = 'https://lmarena.ai';
        this.onTokenCallback = null;
    }

    buildUrl(model = null, modality = 'text') {
        let detectedModality = modality;
        if (model && MODEL_CONFIG[model]) {
            detectedModality = MODEL_CONFIG[model].modality;
        } else if (model) {
            const m = model.toLowerCase();
            if (m.includes('image') || m.includes('flux') || m.includes('dall-e')) {
                detectedModality = 'image';
            } else if (m.includes('search') || m.includes('grounding') || m.includes('sonar')) {
                detectedModality = 'search';
            }
        }

        let url = `${this.baseUrl}/?mode=direct`;
        if (model) {
            url += `&model=${encodeURIComponent(model)}`;
        }
        url += `&chat-modality=${detectedModality}`;

        return { url, modality: detectedModality };
    }

    async initialize(model = null) {
        if (this.isInitialized) {
            return { model: this.currentModel, modality: this.currentModality };
        }

        if (this.initializingPromise) {
            return await this.initializingPromise;
        }

        this.initializingPromise = (async () => {
            console.log('[LMArena-Opt] Initializing...');
            this.page = await browserController.getPage();

            if (!this.page) {
                throw new Error('Failed to get browser page');
            }

            // CRITICAL: Inject SSE interceptor BEFORE any navigation
            // This ensures we catch all fetch calls including the first one
            await this.page.evaluateOnNewDocument(() => {
                // SSE Token Storage
                window._groveTokens = '';
                window._groveStreamDone = false;
                window._groveStreamActive = false;

                // Intercept fetch BEFORE any calls happen
                const originalFetch = window.fetch;
                window.fetch = async function (...args) {
                    const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';

                    const response = await originalFetch.apply(this, args);

                    // Intercept SSE streams
                    if (url.includes('stream/create-evaluation') || url.includes('stream')) {
                        const contentType = response.headers.get('content-type') || '';

                        if (contentType.includes('text/event-stream') || contentType.includes('text/plain')) {
                            console.log('[Grove] SSE Stream detected:', url);
                            window._groveTokens = '';
                            window._groveStreamDone = false;
                            window._groveStreamActive = true;

                            const clone = response.clone();
                            const reader = clone.body.getReader();
                            const decoder = new TextDecoder();

                            (async function readStream() {
                                try {
                                    while (true) {
                                        const { done, value } = await reader.read();
                                        if (done) {
                                            window._groveStreamDone = true;
                                            window._groveStreamActive = false;
                                            console.log('[Grove] Stream complete, total:', window._groveTokens.length);
                                            break;
                                        }

                                        const chunk = decoder.decode(value, { stream: true });

                                        // Parse a0:"token" format (Vercel AI SDK)
                                        const tokenRegex = /a0:"((?:[^"\\]|\\.)*)"/g;
                                        let match;
                                        while ((match = tokenRegex.exec(chunk)) !== null) {
                                            // Unescape the token
                                            let token = match[1]
                                                .replace(/\\n/g, '\n')
                                                .replace(/\\r/g, '\r')
                                                .replace(/\\t/g, '\t')
                                                .replace(/\\"/g, '"')
                                                .replace(/\\\\/g, '\\');
                                            window._groveTokens += token;
                                        }
                                    }
                                } catch (e) {
                                    console.error('[Grove] Stream error:', e);
                                    window._groveStreamDone = true;
                                    window._groveStreamActive = false;
                                }
                            })();
                        }
                    }

                    return response;
                };

                console.log('[Grove] SSE interceptor installed');
            });

            // Block resources at the request level
            await this.page.setRequestInterception(true);
            this.page.on('request', (request) => {
                const resourceType = request.resourceType();
                const url = request.url();

                // Block everything except documents, scripts, xhr, fetch
                if (['image', 'media', 'font', 'stylesheet'].includes(resourceType)) {
                    request.abort();
                } else if (url.includes('analytics') || url.includes('google-analytics') ||
                    url.includes('gtag') || url.includes('tracking') ||
                    url.includes('sentry') || url.includes('hotjar')) {
                    request.abort();
                } else {
                    request.continue();
                }
            });

            const { url, modality } = this.buildUrl(model);
            await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

            // Wait for page to stabilize
            await delay(1000);

            // AGGRESSIVE DOM stripping - keep only textarea and send button
            await this.stripDOM();

            this.currentModel = model;
            this.currentModality = modality;
            this.isInitialized = true;

            console.log('[LMArena-Opt] Initialized with DOM stripped');
            return { model: this.currentModel, modality: this.currentModality };
        })();

        try {
            return await this.initializingPromise;
        } finally {
            this.initializingPromise = null;
        }
    }

    async stripDOM() {
        await this.page.evaluate(() => {
            // Performance: CSS to hide elements + DOM removal for heavy stuff
            const style = document.createElement('style');
            style.id = 'nebula-strip';
            style.textContent = `
                /* Disable animations */
                *, *::before, *::after { 
                    animation-duration: 0s !important;
                    transition-duration: 0s !important;
                }
                
                /* Hide UI chrome */
                aside, [data-side="left"], .sidebar,
                header, nav, footer,
                [class*="banner"], [class*="announcement"] { 
                    display: none !important; 
                }
                
                /* Keep input area */
                textarea { 
                    display: block !important; 
                    visibility: visible !important;
                }
            `;
            document.head.appendChild(style);

            // Remove heavy DOM elements to prevent memory bloat
            const removeSelectors = [
                'aside', 'header', 'nav', 'footer',
                '.sidebar', '[data-side]',
                '[class*="banner"]', '[class*="announcement"]',
                'video', 'canvas'
            ];

            removeSelectors.forEach(sel => {
                try {
                    document.querySelectorAll(sel).forEach(el => el.remove());
                } catch (e) { }
            });

            console.log('[Nebula] Initial DOM stripped');
        });
    }

    // Call this AFTER each response completes to clean up chat history
    async cleanupChatHistory() {
        try {
            await this.page.evaluate(() => {
                // Remove old chat messages but keep the last one (current response)
                const messages = document.querySelectorAll('.prose, [class*="prose"]');
                messages.forEach((el, i) => {
                    if (i < messages.length - 1) el.remove();
                });

                // Also clean up message list items
                const listItems = document.querySelectorAll('ul[class*="flex-col-reverse"] > li');
                listItems.forEach((el, i) => {
                    if (i > 0) el.remove(); // Keep only the last one
                });
            });
        } catch (e) {
            // Page may have navigated, ignore
        }
    }



    async selectModel(modelName) {
        if (!this.isInitialized) {
            return await this.initialize(modelName);
        }

        const { url, modality } = this.buildUrl(modelName);
        console.log(`[LMArena-Opt] Switching to: ${modelName}`);

        await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await delay(500);
        await this.stripDOM();

        this.currentModel = modelName;
        this.currentModality = modality;

        return { success: true };
    }

    async sendMessage(message, onToken = null) {
        if (!this.isInitialized) {
            throw new Error('Not initialized');
        }

        console.log(`[LMArena-Opt] Sending: ${message.substring(0, 50)}...`);
        this.onTokenCallback = onToken;

        // Reset stream state
        await this.page.evaluate(() => {
            window._groveTokens = '';
            window._groveStreamDone = false;
            window._groveStreamActive = false;
        });

        // Wait for textarea
        await this.page.waitForSelector('textarea', { timeout: 10000 });

        // Type message using React-compatible method
        await this.page.evaluate((msg) => {
            const textarea = document.querySelector('textarea');
            if (textarea) {
                textarea.focus();

                // React hack: use native value setter
                const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                    window.HTMLTextAreaElement.prototype, "value"
                ).set;
                nativeInputValueSetter.call(textarea, msg);

                // Fire events
                textarea.dispatchEvent(new Event('input', { bubbles: true }));
                textarea.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }, message);

        await delay(300);

        // Click send - find the button
        const clicked = await this.page.evaluate(() => {
            // Try multiple selectors
            const btn = document.querySelector('button[aria-label*="Send"]') ||
                document.querySelector('button[aria-label*="send"]') ||
                document.querySelector('form button[type="submit"]') ||
                Array.from(document.querySelectorAll('button')).find(b => {
                    const svg = b.querySelector('svg');
                    return svg && b.offsetWidth > 0; // Visible button with SVG icon
                });

            if (btn) {
                btn.click();
                console.log('[Grove] Clicked send button');
                return true;
            }
            return false;
        });

        if (!clicked) {
            // Fallback: press Enter
            console.log('[LMArena-Opt] No button found, pressing Enter');
            await this.page.keyboard.press('Enter');
        }

        // Wait for response with streaming
        return await this.waitForResponse(300000);
    }

    async waitForResponse(timeout = 60000) {
        const startTime = Date.now();
        let lastTokenLen = 0;
        let noChangeCount = 0;
        let lastStreamedLen = 0;

        console.log('[LMArena-Opt] Waiting for response...');

        while (Date.now() - startTime < timeout) {
            await delay(50);

            try {
                const state = await this.page.evaluate(() => ({
                    tokens: window._groveTokens || '',
                    done: window._groveStreamDone || false,
                    active: window._groveStreamActive || false
                }));

                // Stream new tokens
                if (state.tokens.length > lastStreamedLen && this.onTokenCallback) {
                    const delta = state.tokens.slice(lastStreamedLen);
                    console.log(`[LMArena-Opt] Token: +${delta.length} chars`);
                    this.onTokenCallback({
                        fullText: state.tokens,
                        delta: delta,
                        imageUrl: null,
                        chatId: null,
                        sources: []
                    });
                    lastStreamedLen = state.tokens.length;
                }

                // Check completion
                if (state.done && state.tokens.length > 0) {
                    console.log('[LMArena-Opt] Stream complete');

                    // Clean DOM
                    await this.page.evaluate(() => {
                        document.querySelectorAll('.prose, [class*="prose"]').forEach(el => el.remove());
                    });

                    return {
                        response: state.tokens,
                        chatId: null,
                        sources: []
                    };
                }

                // Detect stall (no change for 15 seconds after receiving some data)
                if (state.tokens.length === lastTokenLen && state.tokens.length > 0) {
                    noChangeCount++;
                    if (noChangeCount >= 300) { // 15 seconds at 50ms intervals
                        console.log('[LMArena-Opt] Stream stalled for 15s, returning partial');
                        return {
                            response: state.tokens,
                            chatId: null,
                            sources: []
                        };
                    }
                } else {
                    noChangeCount = 0;
                    lastTokenLen = state.tokens.length;
                }

                // Still waiting for stream to start
                if (!state.active && state.tokens.length === 0 && Date.now() - startTime > 30000) {
                    console.log('[LMArena-Opt] No stream started after 30s, checking DOM...');
                    // Fallback to DOM check
                    const domContent = await this.page.evaluate(() => {
                        const prose = document.querySelector('.prose:not(.self-end .prose)');
                        return prose ? prose.innerText : null;
                    });
                    if (domContent && domContent.length > 10) {
                        return { response: domContent, chatId: null, sources: [] };
                    }
                }

            } catch (e) {
                console.log('[LMArena-Opt] Eval error:', e.message);
                await delay(500);
            }
        }

        // Return whatever we have
        const finalState = await this.page.evaluate(() => ({
            tokens: window._groveTokens || ''
        })).catch(() => ({ tokens: '' }));

        if (finalState.tokens) {
            return { response: finalState.tokens, chatId: null, sources: [] };
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

module.exports = new LMArenaOptimized();
