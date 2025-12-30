/**
 * NebulaCLI - Model Orchestrator
 * Automatically selects the best model for each task type
 */

const { MODEL_STRENGTHS } = require('./prompts');

// Model configuration with performance characteristics
const MODEL_PROFILES = {
    // Tier 1: Premium reasoning
    'claude-opus-4-5-20251101': {
        tier: 1,
        strengths: ['planning', 'architecture', 'complex-reasoning', 'debugging'],
        speed: 'slow',
        tokens: 'high',
        costWeight: 1.0  // Most "expensive" in terms of rate limits
    },
    'claude-opus-4-5-20251101-thinking-32k': {
        tier: 1,
        strengths: ['deep-analysis', 'multi-step-reasoning'],
        speed: 'very-slow',
        tokens: 'very-high',
        costWeight: 1.5
    },

    // Tier 2: Fast premium
    'gpt-5.2-high': {
        tier: 2,
        strengths: ['coding', 'api-integration', 'web-development', 'general'],
        speed: 'medium',
        tokens: 'medium',
        costWeight: 0.8
    },
    'gpt-5.2': {
        tier: 2,
        strengths: ['coding', 'general', 'refactoring'],
        speed: 'fast',
        tokens: 'medium',
        costWeight: 0.6
    },
    'claude-sonnet-4-5-20250929': {
        tier: 2,
        strengths: ['coding', 'debugging', 'refactoring', 'tests'],
        speed: 'fast',
        tokens: 'medium',
        costWeight: 0.7
    },

    // Tier 3: Fast & efficient
    'gemini-3-pro': {
        tier: 3,
        strengths: ['fast-reasoning', 'code-review', 'explanations', 'general'],
        speed: 'fast',
        tokens: 'low',
        costWeight: 0.4
    },
    'gemini-3-flash': {
        tier: 3,
        strengths: ['quick-tasks', 'simple-edits', 'formatting'],
        speed: 'very-fast',
        tokens: 'very-low',
        costWeight: 0.2
    },
    'deepseek-v3.2': {
        tier: 3,
        strengths: ['algorithms', 'optimization', 'math', 'data-structures'],
        speed: 'fast',
        tokens: 'low',
        costWeight: 0.3
    },

    // Tier 4: Search/Research
    'gpt-5.2-search': {
        tier: 4,
        strengths: ['research', 'documentation', 'api-discovery', 'current-info'],
        speed: 'medium',
        tokens: 'medium',
        costWeight: 0.5
    },
    'gemini-3-pro-grounding': {
        tier: 4,
        strengths: ['research', 'fact-checking', 'current-info'],
        speed: 'fast',
        tokens: 'low',
        costWeight: 0.4
    },
    'ppl-sonar-reasoning-pro-high': {
        tier: 4,
        strengths: ['deep-research', 'synthesis', 'multi-source'],
        speed: 'slow',
        tokens: 'high',
        costWeight: 0.7
    },

    // Tier 5: Image generation
    'gpt-image-1.5': {
        tier: 5,
        strengths: ['image-generation', 'logos', 'assets', 'ui-mockups'],
        speed: 'slow',
        tokens: 'n/a',
        costWeight: 0.8
    },
    'gemini-3-pro-image-preview-2k (nano-banana-pro)': {
        tier: 5,
        strengths: ['image-generation', 'quick-assets'],
        speed: 'medium',
        tokens: 'n/a',
        costWeight: 0.5
    }
};

// Task type to model mapping
const TASK_MODEL_MAP = {
    // High-level planning
    'planning': ['claude-opus-4-5-20251101', 'gpt-5.2-high', 'gemini-3-pro'],
    'architecture': ['claude-opus-4-5-20251101', 'gpt-5.2-high'],

    // Coding tasks
    'coding': ['gpt-5.2', 'claude-sonnet-4-5-20250929', 'gemini-3-pro'],
    'debugging': ['claude-opus-4-5-20251101', 'claude-sonnet-4-5-20250929', 'gpt-5.2'],
    'refactoring': ['claude-sonnet-4-5-20250929', 'gpt-5.2', 'gemini-3-pro'],
    'testing': ['claude-sonnet-4-5-20250929', 'gpt-5.2'],

    // Quick tasks
    'simple-edit': ['gemini-3-flash', 'gemini-3-pro'],
    'formatting': ['gemini-3-flash'],
    'rename': ['gemini-3-flash'],

    // Research
    'research': ['gpt-5.2-search', 'gemini-3-pro-grounding', 'ppl-sonar-reasoning-pro-high'],
    'api-lookup': ['gpt-5.2-search', 'gemini-3-pro-grounding'],
    'documentation': ['gpt-5.2-search', 'gemini-3-pro-grounding'],

    // Specialized
    'algorithms': ['deepseek-v3.2', 'claude-opus-4-5-20251101'],
    'math': ['deepseek-v3.2', 'claude-opus-4-5-20251101'],
    'optimization': ['deepseek-v3.2', 'gpt-5.2'],

    // Assets
    'image-generation': ['gpt-image-1.5', 'gemini-3-pro-image-preview-2k (nano-banana-pro)'],
    'logo': ['gpt-image-1.5'],
    'asset': ['gpt-image-1.5', 'gemini-3-pro-image-preview-2k (nano-banana-pro)']
};

class ModelOrchestrator {
    constructor() {
        this.usageTracker = new Map(); // Track usage per model to avoid rate limits
        this.cooldowns = new Map();    // Models on cooldown after errors
        this.preferredModel = null;    // User can lock a specific model
    }

    /**
     * Select the best model for a given task
     * @param {string} taskType - Type of task (coding, research, etc.)
     * @param {object} options - Additional options
     * @returns {string} Model ID
     */
    selectModel(taskType, options = {}) {
        const { forceModel, preferSpeed, avoidModels = [] } = options;

        // If user locked a model, use it
        if (this.preferredModel) {
            return this.preferredModel;
        }

        // If caller forced a specific model
        if (forceModel && MODEL_PROFILES[forceModel]) {
            return forceModel;
        }

        // Get candidates for this task type
        let candidates = TASK_MODEL_MAP[taskType] || TASK_MODEL_MAP['coding'];

        // Filter out avoided models and models on cooldown
        const now = Date.now();
        candidates = candidates.filter(m => {
            if (avoidModels.includes(m)) return false;
            const cooldown = this.cooldowns.get(m);
            if (cooldown && cooldown > now) return false;
            return true;
        });

        if (candidates.length === 0) {
            // Fallback to any available model
            candidates = ['gemini-3-pro', 'gpt-5.2'];
        }

        // If preferring speed, sort by speed
        if (preferSpeed) {
            candidates.sort((a, b) => {
                const speedOrder = { 'very-fast': 0, 'fast': 1, 'medium': 2, 'slow': 3, 'very-slow': 4 };
                const aSpeed = MODEL_PROFILES[a]?.speed || 'medium';
                const bSpeed = MODEL_PROFILES[b]?.speed || 'medium';
                return speedOrder[aSpeed] - speedOrder[bSpeed];
            });
        }

        // Sort by cost weight (prefer cheaper to conserve rate limits)
        candidates.sort((a, b) => {
            const aCost = MODEL_PROFILES[a]?.costWeight || 0.5;
            const bCost = MODEL_PROFILES[b]?.costWeight || 0.5;
            return aCost - bCost;
        });

        // Take the best candidate
        return candidates[0];
    }

    /**
     * Infer task type from a step description
     * @param {string} description - Step description
     * @returns {string} Inferred task type
     */
    inferTaskType(description) {
        const lower = description.toLowerCase();

        // Research patterns
        if (lower.includes('research') || lower.includes('find') || lower.includes('look up') ||
            lower.includes('search') || lower.includes('documentation')) {
            return 'research';
        }

        // Planning patterns
        if (lower.includes('plan') || lower.includes('architect') || lower.includes('design') ||
            lower.includes('structure')) {
            return 'planning';
        }

        // Testing patterns
        if (lower.includes('test') || lower.includes('spec') || lower.includes('verify')) {
            return 'testing';
        }

        // Debug patterns
        if (lower.includes('debug') || lower.includes('fix') || lower.includes('error') ||
            lower.includes('bug')) {
            return 'debugging';
        }

        // Refactoring patterns
        if (lower.includes('refactor') || lower.includes('clean') || lower.includes('improve') ||
            lower.includes('optimize')) {
            return 'refactoring';
        }

        // Simple patterns
        if (lower.includes('rename') || lower.includes('move') || lower.includes('delete')) {
            return 'simple-edit';
        }

        // Image patterns
        if (lower.includes('logo') || lower.includes('image') || lower.includes('icon') ||
            lower.includes('asset') || lower.includes('generate image')) {
            return 'image-generation';
        }

        // Algorithm patterns
        if (lower.includes('algorithm') || lower.includes('sort') || lower.includes('graph') ||
            lower.includes('tree') || lower.includes('optimize')) {
            return 'algorithms';
        }

        // Default to coding
        return 'coding';
    }

    /**
     * Report a model failure (puts it on cooldown)
     */
    reportFailure(modelId) {
        const currentCooldown = this.cooldowns.get(modelId) || 0;
        const now = Date.now();

        // Exponential backoff: 30s, 60s, 120s, etc.
        let newCooldown = now + 30000;
        if (currentCooldown > now) {
            const remainingCooldown = currentCooldown - now;
            newCooldown = now + Math.min(remainingCooldown * 2, 600000); // Max 10 minutes
        }

        this.cooldowns.set(modelId, newCooldown);
        console.log(`[Orchestrator] Model ${modelId} on cooldown until ${new Date(newCooldown).toLocaleTimeString()}`);
    }

    /**
     * Report successful usage (clears cooldown)
     */
    reportSuccess(modelId) {
        this.cooldowns.delete(modelId);
    }

    /**
     * Lock to a specific model (user preference)
     */
    setPreferredModel(modelId) {
        if (modelId === null || MODEL_PROFILES[modelId]) {
            this.preferredModel = modelId;
            console.log(`[Orchestrator] Preferred model: ${modelId || 'auto'}`);
        }
    }

    /**
     * Get all available models
     */
    getAvailableModels() {
        return Object.entries(MODEL_PROFILES).map(([id, profile]) => ({
            id,
            ...profile
        }));
    }
}

module.exports = new ModelOrchestrator();
