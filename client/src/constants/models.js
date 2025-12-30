export const MODEL_PROVIDERS = {
    text: [
        {
            id: 'openai',
            name: 'OpenAI',
            models: [
                { id: 'gpt-5.2-high', name: 'GPT-5.2 High' },
                { id: 'gpt-5.2', name: 'GPT-5.2' },
                { id: 'gpt-5.1-high', name: 'GPT-5.1 High' },
                { id: 'gpt-5.1', name: 'GPT-5.1' },
                { id: 'gpt-5-high', name: 'GPT-5 High' },
                { id: 'gpt-5-high-new-system-prompt', name: 'GPT-5 High (New)' },
                { id: 'gpt-5-chat', name: 'GPT-5 Chat' },
                { id: 'o3-2025-04-16', name: 'o3' },
                { id: 'o3-mini', name: 'o3-mini' },
                { id: 'chatgpt-4o-latest-2025-03-26', name: 'ChatGPT-4o (Latest)' },
                { id: 'gpt-4.1-2025-04-14', name: 'GPT-4.1' },
                { id: 'gpt-4.1-mini-2025-04-14', name: 'GPT-4.1 Mini' },
                { id: 'gpt-oss-120b', name: 'GPT-OSS 120B' },
                { id: 'gpt-oss-20b', name: 'GPT-OSS 20B' },
                { id: 'gpt-5-mini-high', name: 'GPT-5 Mini High' },
                { id: 'gpt-5-nano-high', name: 'GPT-5 Nano High' }
            ]
        },
        {
            id: 'google',
            name: 'Google',
            models: [
                { id: 'gemini-3-pro', name: 'Gemini 3 Pro' },
                { id: 'gemini-3-flash', name: 'Gemini 3 Flash' },
                { id: 'gemini-3-flash (thinking-minimal)', name: 'Gemini 3 Flash (Thinking)' },
                { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
                { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
                { id: 'gemini-2.5-flash-preview-09-2025', name: 'Gemini 2.5 Flash (Preview)' },
                { id: 'gemini-2.5-flash-lite-preview-09-2025-no-thinking', name: 'Gemini 2.5 Flash Lite' },
                { id: 'gemini-2.5-flash-lite-preview-06-17-thinking', name: 'Gemini 2.5 Flash Lite (Thinking)' },
                { id: 'gemini-2.0-flash-001', name: 'Gemini 2.0 Flash' },
                { id: 'gemma-3-27b-it', name: 'Gemma 3 27B' },
                { id: 'gemma-3n-e4b-it', name: 'Gemma 3n e4b' }
            ]
        },
        {
            id: 'anthropic',
            name: 'Anthropic',
            models: [
                { id: 'claude-opus-4-5-20251101-thinking-32k', name: 'Claude Opus 4.5 (Thinking)' },
                { id: 'claude-opus-4-5-20251101', name: 'Claude Opus 4.5' },
                { id: 'claude-sonnet-4-5-20250929-thinking-32k', name: 'Claude Sonnet 4.5 (Thinking)' },
                { id: 'claude-sonnet-4-5-20250929', name: 'Claude Sonnet 4.5' },
                { id: 'claude-opus-4-1-20250805-thinking-16k', name: 'Claude Opus 4.1 (Thinking)' },
                { id: 'claude-opus-4-1-20250805', name: 'Claude Opus 4.1' },
                { id: 'claude-opus-4-20250514-thinking-16k', name: 'Claude Opus 4 (Thinking)' },
                { id: 'claude-opus-4-20250514', name: 'Claude Opus 4' },
                { id: 'claude-sonnet-4-20250514-thinking-32k', name: 'Claude Sonnet 4 (Thinking)' },
                { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4' },
                { id: 'claude-3-7-sonnet-20250219-thinking-32k', name: 'Claude 3.7 Sonnet (Thinking)' },
                { id: 'claude-3-7-sonnet-20250219', name: 'Claude 3.7 Sonnet' },
                { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' },
                { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku' },
                { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5' }
            ]
        },
        {
            id: 'xai',
            name: 'xAI',
            models: [
                { id: 'grok-4.1-thinking', name: 'Grok 4.1 (Thinking)' },
                { id: 'grok-4.1', name: 'Grok 4.1' },
                { id: 'grok-4-1-fast-reasoning', name: 'Grok 4.1 Fast Reasoning' },
                { id: 'grok-4-1-fast-non-reasoning', name: 'Grok 4.1 Fast' },
                { id: 'grok-4-fast-reasoning', name: 'Grok 4 Fast Reasoning' },
                { id: 'grok-4-fast-chat', name: 'Grok 4 Fast Chat' },
                { id: 'grok-4-0709', name: 'Grok 4' },
                { id: 'grok-3-mini-high', name: 'Grok 3 Mini High' },
                { id: 'grok-3-mini-beta', name: 'Grok 3 Mini Beta' }
            ]
        },
        {
            id: 'deepseek',
            name: 'DeepSeek',
            models: [
                { id: 'deepseek-v3.2-thinking', name: 'DeepSeek V3.2 (Thinking)' },
                { id: 'deepseek-v3.2', name: 'DeepSeek V3.2' },
                { id: 'deepseek-v3-0324', name: 'DeepSeek V3' }
            ]
        },
        {
            id: 'others',
            name: 'Others',
            models: [
                { id: 'qwen3-max-preview', name: 'Qwen3 Max (Preview)' },
                { id: 'qwen3-max-2025-09-23', name: 'Qwen3 Max' },
                { id: 'qwen3-max-2025-09-26', name: 'Qwen3 Max (Latest)' },
                { id: 'qwen3-235b-a22b-thinking-2507', name: 'Qwen3 235B (Thinking)' },
                { id: 'qwen3-235b-a22b-no-thinking', name: 'Qwen3 235B' },
                { id: 'qwen3-next-80b-a3b-thinking', name: 'Qwen3 Next 80B (Thinking)' },
                { id: 'qwen3-next-80b-a3b-instruct', name: 'Qwen3 Next 80B' },
                { id: 'qwen3-coder-480b-a35b-instruct', name: 'Qwen3 Coder' },
                { id: 'qwq-32b', name: 'QwQ 32B' },
                { id: 'mistral-large-3', name: 'Mistral Large 3' },
                { id: 'mistral-medium-2508', name: 'Mistral Medium' },
                { id: 'mistral-small-3.1-24b-instruct-2503', name: 'Mistral Small 3.1' },
                { id: 'llama-4-maverick-17b-128e-instruct', name: 'Llama 4 Maverick' },
                { id: 'llama-3.3-70b-instruct', name: 'Llama 3.3 70B' },
                { id: 'ernie-5.0-preview-1203', name: 'ERNIE 5.0 (1203)' },
                { id: 'ernie-5.0-preview-1103', name: 'ERNIE 5.0 (1103)' },
                { id: 'ernie-5.0-preview-1120', name: 'ERNIE 5.0 (1120)' },
                { id: 'kimi-k2-thinking-turbo', name: 'Kimi K2 (Thinking)' },
                { id: 'kimi-k2-0905-preview', name: 'Kimi K2 (0905)' },
                { id: 'kimi-k2-0711-preview', name: 'Kimi K2 (0711)' },
                { id: 'glm-4.7', name: 'GLM 4.7' },
                { id: 'glm-4.6', name: 'GLM 4.6' },
                { id: 'glm-4.5', name: 'GLM 4.5' },
                { id: 'minimax-m2.1-preview', name: 'MiniMax M2.1' },
                { id: 'minimax-m2-preview', name: 'MiniMax M2' },
                { id: 'minimax-m1', name: 'MiniMax M1' },
                { id: 'amazon-nova-experimental-chat-11-10', name: 'Amazon Nova (Exp)' },
                { id: 'amazon.nova-pro-v1:0', name: 'Amazon Nova Pro' },
                { id: 'step-3', name: 'Step 3' },
                { id: 'intellect-3', name: 'Intellect 3' },
                { id: 'olmo-3.1-32b-think', name: 'OLMo 3.1 (Thinking)' },
                { id: 'ibm-granite-h-small', name: 'IBM Granite' }
            ]
        }
    ],
    image: [
        {
            id: 'openai',
            name: 'OpenAI',
            models: [
                { id: 'dall-e-3', name: 'DALL-E 3' },
                { id: 'gpt-image-1.5', name: 'GPT Image 1.5' },
                { id: 'gpt-image-1', name: 'GPT Image 1' },
                { id: 'gpt-image-1-mini', name: 'GPT Image Mini' },
                { id: 'chatgpt-image-latest (20251216)', name: 'ChatGPT Image' }
            ]
        },
        {
            id: 'google',
            name: 'Google',
            models: [
                { id: 'gemini-3-pro-image-preview-2k (nano-banana-pro)', name: 'Gemini 3 Pro Image (2K)' },
                { id: 'gemini-3-pro-image-preview (nano-banana-pro)', name: 'Gemini 3 Pro Image' },
                { id: 'gemini-2.5-flash-image-preview (nano-banana)', name: 'Gemini 2.5 Flash Image' },
                { id: 'gemini-2.0-flash-preview-image-generation', name: 'Gemini 2.0 Flash Image' },
                { id: 'imagen-4.0-ultra-generate-001', name: 'Imagen 4.0 Ultra' },
                { id: 'imagen-4.0-generate-001', name: 'Imagen 4.0' },
                { id: 'imagen-3.0-generate-002', name: 'Imagen 3.0' }
            ]
        },
        {
            id: 'others',
            name: 'Others',
            models: [
                { id: 'flux-2-max', name: 'FLUX 2 Max' },
                { id: 'flux-2-pro', name: 'FLUX 2 Pro' },
                { id: 'flux-2-dev', name: 'FLUX 2 Dev' },
                { id: 'flux-2-flex', name: 'FLUX 2 Flex' },
                { id: 'flux-1-kontext-pro', name: 'FLUX 1 Kontext Pro' },
                { id: 'recraft-v3', name: 'Recraft V3' },
                { id: 'ideogram-v3-quality', name: 'Ideogram V3' },
                { id: 'seedream-4.5', name: 'SeeDream 4.5' },
                { id: 'seedream-4-high-res-fal', name: 'SeeDream 4 HR' },
                { id: 'hunyuan-image-3.0', name: 'Hunyuan Image 3.0' },
                { id: 'wan2.5-t2i-preview', name: 'Wan 2.5 T2I' },
                { id: 'photon', name: 'Photon' },
                { id: 'reve-v1.1', name: 'Reve V1.1' }
            ]
        }
    ],
    search: [
        {
            id: 'google',
            name: 'Google',
            models: [
                { id: 'gemini-3-pro-grounding', name: 'Gemini 3 Pro (Grounding)' },
                { id: 'gemini-2.5-pro-grounding', name: 'Gemini 2.5 Pro (Grounding)' }
            ]
        },
        {
            id: 'openai',
            name: 'OpenAI',
            models: [
                { id: 'gpt-5.2-search', name: 'GPT-5.2 Search' },
                { id: 'gpt-5.1-search', name: 'GPT-5.1 Search' },
                { id: 'gpt-5.1-search-sp', name: 'GPT-5.1 Search SP' },
                { id: 'gpt-5-search', name: 'GPT-5 Search' },
                { id: 'o3-search', name: 'o3 Search' }
            ]
        },
        {
            id: 'xai',
            name: 'xAI',
            models: [
                { id: 'grok-4-1-fast-search', name: 'Grok 4.1 Fast Search' },
                { id: 'grok-4-fast-search', name: 'Grok 4 Fast Search' },
                { id: 'grok-4-search', name: 'Grok 4 Search' }
            ]
        },
        {
            id: 'anthropic',
            name: 'Anthropic',
            models: [
                { id: 'claude-opus-4-1-search', name: 'Claude Opus 4.1 Search' },
                { id: 'claude-opus-4-search', name: 'Claude Opus 4 Search' }
            ]
        },
        {
            id: 'others',
            name: 'Others',
            models: [
                { id: 'ppl-sonar-reasoning-pro-high', name: 'Perplexity Sonar Reasoning Pro' },
                { id: 'ppl-sonar-pro-high', name: 'Perplexity Sonar Pro' },
                { id: 'diffbot-small-xl', name: 'Diffbot Small XL' }
            ]
        }
    ]
};

// Flattened list for lookup
export const ALL_MODELS = [
    ...MODEL_PROVIDERS.text.flatMap(p => p.models.map(m => ({ ...m, provider: p.id, modality: 'text' }))),
    ...MODEL_PROVIDERS.image.flatMap(p => p.models.map(m => ({ ...m, provider: p.id, modality: 'image' }))),
    ...MODEL_PROVIDERS.search.flatMap(p => p.models.map(m => ({ ...m, provider: p.id, modality: 'search' })))
];
