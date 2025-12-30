import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Markdown from 'react-markdown';
import useSocket from '../hooks/useSocket';
import ImageLibrary from './ImageLibrary';
import ModelSelector from './ModelSelector';
import PersonalityManager from './PersonalityManager';
import CodeCanvas from './CodeCanvas';
import { MODEL_PROVIDERS } from '../constants/models';
import { MODEL_ICONS } from '../constants/modelIcons';

// Helper function to check if code looks like HTML
function looksLikeHtml(code) {
    const trimmed = code.trim();
    // Check for common HTML patterns
    const htmlPatterns = [
        /^<!DOCTYPE\s+html/i,
        /^<html[\s>]/i,
        /^<head[\s>]/i,
        /^<body[\s>]/i,
        /<\/html>/i,
        /<\/head>/i,
        /<\/body>/i,
        /<div[\s>].*<\/div>/is,
        /<style[\s>][\s\S]*<\/style>/i,
        /<script[\s>][\s\S]*<\/script>/i,
        /<link\s+.*rel\s*=\s*["']stylesheet["']/i,
        /<meta\s+.*charset/i,
    ];

    // If it starts with < and contains closing tags, likely HTML
    if (trimmed.startsWith('<') && (trimmed.includes('</') || trimmed.includes('/>'))) {
        // Additional check - common HTML tags
        if (/<(html|head|body|div|span|p|h[1-6]|section|article|header|footer|nav|main|form|input|button|a|img|ul|ol|li|table|tr|td|th|style|script|link|meta)[\s>]/i.test(trimmed)) {
            return true;
        }
    }

    return htmlPatterns.some(pattern => pattern.test(trimmed));
}

// Helper function to extract HTML code blocks from content
function extractHtmlBlocks(content) {
    const htmlBlocks = [];

    // Match both ```html ... ``` AND plain ``` ... ``` blocks
    const codeBlockRegex = /```(html|htm)?\s*\n([\s\S]*?)```/gi;
    let match;

    while ((match = codeBlockRegex.exec(content)) !== null) {
        const language = match[1]; // 'html', 'htm', or undefined
        const code = match[2].trim();

        // Include if explicitly marked as HTML or if content looks like HTML
        if (language || looksLikeHtml(code)) {
            htmlBlocks.push({
                code: code,
                fullMatch: match[0],
                index: match.index
            });
        }
    }

    return htmlBlocks;
}

// Get content without the HTML code blocks for regular markdown display
function getContentWithoutHtmlBlocks(content, htmlBlocks) {
    if (htmlBlocks.length === 0) return content;

    let result = content;
    // Replace each HTML block with a placeholder
    htmlBlocks.forEach((block, i) => {
        result = result.replace(block.fullMatch, `\n**[Canvas ${i + 1} - Click to Preview]**\n`);
    });

    return result;
}


function ChatBox() {
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [isStreaming, setIsStreaming] = useState(false);
    const [streamingContent, setStreamingContent] = useState('');
    const [selectedModel, setSelectedModel] = useState('gpt-image-1.5');
    const [currentModality, setCurrentModality] = useState('text');
    const [currentChatId, setCurrentChatId] = useState('');
    const [chatHistory, setChatHistory] = useState([]);
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [savedImages, setSavedImages] = useState([]);
    const [showLibrary, setShowLibrary] = useState(false);
    const [activeMenu, setActiveMenu] = useState(null);

    // Feature States
    const [incognitoMode, setIncognitoMode] = useState(false);
    const [editTarget, setEditTarget] = useState(null);
    const [branchContext, setBranchContext] = useState('');

    // Personalities
    const [showPersonalities, setShowPersonalities] = useState(false);
    const [activePersonalityId, setActivePersonalityId] = useState('standard');

    // Voice Mode State
    const [voiceModeEnabled, setVoiceModeEnabled] = useState(false);
    const [speaking, setSpeaking] = useState(false);
    const spokenTextRef = useRef('');

    // File Attachments
    const [attachedFiles, setAttachedFiles] = useState([]);
    const [attachedImages, setAttachedImages] = useState([]);

    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);
    const fileInputRef = useRef(null);
    const imageInputRef = useRef(null);

    const { isConnected, isReady, status, sendMessage, selectModel, loadChat: loadChatBackend, socket } = useSocket();

    // --- Voice Logic ---
    const speakText = useCallback((text) => {
        if (!window.speechSynthesis) return;
        const utterance = new SpeechSynthesisUtterance(text);
        const voices = window.speechSynthesis.getVoices();
        const preferredVoice = voices.find(v => v.name.includes('Microsoft') && v.name.includes('Online') && v.name.includes('Natural'))
            || voices.find(v => v.name.includes('Google US English'))
            || voices[0];
        if (preferredVoice) utterance.voice = preferredVoice;
        utterance.onstart = () => setSpeaking(true);
        utterance.onend = () => setSpeaking(false);
        window.speechSynthesis.speak(utterance);
    }, []);

    useEffect(() => {
        if (!voiceModeEnabled || !isStreaming || !streamingContent) return;
        const newText = streamingContent.slice(spokenTextRef.current.length);
        if (newText.length === 0) return;
        const match = newText.match(/([.!?]+[\s\n]+)/);
        if (match) {
            const endIndex = match.index + match[0].length;
            const sentence = newText.substring(0, endIndex).trim();
            if (sentence) {
                speakText(sentence);
                spokenTextRef.current += newText.substring(0, endIndex);
            }
        }
    }, [streamingContent, isStreaming, voiceModeEnabled, speakText]);

    useEffect(() => {
        if (!isStreaming) {
            if (voiceModeEnabled && streamingContent.length > spokenTextRef.current.length) {
                const remaining = streamingContent.slice(spokenTextRef.current.length);
                if (remaining.trim()) speakText(remaining);
            }
            spokenTextRef.current = '';
        }
    }, [isStreaming, streamingContent, voiceModeEnabled, speakText]);

    // --- Persistance ---
    useEffect(() => {
        const stored = localStorage.getItem('lmarena_images');
        if (stored) setSavedImages(JSON.parse(stored));
    }, []);

    const saveImage = useCallback((url, chatId) => {
        setSavedImages(prev => {
            if (prev.find(img => img.url === url)) return prev;
            const newImages = [{ url, chatId: chatId || 'incognito', timestamp: Date.now() }, ...prev];
            localStorage.setItem('lmarena_images', JSON.stringify(newImages));
            return newImages;
        });
    }, []);

    const deleteImage = useCallback((url) => {
        setSavedImages(prev => {
            const newImages = prev.filter(img => img.url !== url);
            localStorage.setItem('lmarena_images', JSON.stringify(newImages));
            return newImages;
        });
    }, []);

    // Download image
    const downloadImage = async (imageUrl, filename = 'grove-image.png') => {
        try {
            const response = await fetch(imageUrl);
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Failed to download image:', error);
            window.open(imageUrl, '_blank');
        }
    };

    // Handle file selection (code files)
    const handleFileSelect = async (e) => {
        const files = Array.from(e.target.files);
        const textExtensions = ['txt', 'js', 'jsx', 'ts', 'tsx', 'py', 'html', 'css', 'json', 'md', 'xml', 'yaml', 'yml', 'sh', 'bat', 'ps1', 'sql', 'java', 'c', 'cpp', 'h', 'hpp', 'cs', 'go', 'rs', 'rb', 'php', 'swift', 'kt'];

        for (const file of files) {
            const ext = file.name.split('.').pop().toLowerCase();
            if (textExtensions.includes(ext)) {
                const content = await file.text();
                setAttachedFiles(prev => [...prev, {
                    name: file.name,
                    extension: ext,
                    content: content,
                    size: file.size
                }]);
            }
        }
        e.target.value = '';
    };

    // Handle image selection
    const handleImageSelect = async (e) => {
        const files = Array.from(e.target.files);

        for (const file of files) {
            if (file.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    setAttachedImages(prev => [...prev, {
                        name: file.name,
                        dataUrl: event.target.result,
                        size: file.size
                    }]);
                };
                reader.readAsDataURL(file);
            }
        }
        e.target.value = '';
    };

    const removeAttachedFile = (index) => {
        setAttachedFiles(prev => prev.filter((_, i) => i !== index));
    };

    const removeAttachedImage = (index) => {
        setAttachedImages(prev => prev.filter((_, i) => i !== index));
    };

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => { scrollToBottom(); }, [messages, streamingContent]);

    // --- Socket Logic ---
    useEffect(() => {
        if (!socket) return;
        const handleMessageStart = () => { setIsStreaming(true); setStreamingContent(''); spokenTextRef.current = ''; };
        const handleToken = (data) => {
            if (data.fullText) setStreamingContent(data.fullText);
            if (data.imageUrl) saveImage(data.imageUrl, data.chatId);
            if (data.chatId && !incognitoMode) setCurrentChatId(data.chatId);
        };
        const handleMessageComplete = (data) => {
            setIsStreaming(false);
            const imgMatch = data.response.match(/!\[.*?\]\((.*?)\)/);
            if (imgMatch && imgMatch[1]) saveImage(imgMatch[1], data.chatId);
            setMessages(prev => [...prev, { role: 'assistant', content: data.response, chatId: data.chatId, timestamp: new Date() }]);
            setStreamingContent('');
            if (data.chatId && !incognitoMode) setCurrentChatId(data.chatId);
        };
        socket.on('messageStart', handleMessageStart);
        socket.on('token', handleToken);
        socket.on('messageComplete', handleMessageComplete);
        return () => {
            socket.off('messageStart', handleMessageStart);
            socket.off('token', handleToken);
            socket.off('messageComplete', handleMessageComplete);
        };
    }, [socket, saveImage, incognitoMode]);

    const handleModelChange = useCallback((id) => {
        if (!incognitoMode && messages.length > 0 && currentChatId) {
            setChatHistory(prev => {
                const exists = prev.find(c => c.id === currentChatId);
                if (exists) return prev.map(c => c.id === currentChatId ? { ...c, messages } : c);
                return [...prev, { id: currentChatId, title: messages[0]?.content?.substring(0, 30) || 'New Chat', model: selectedModel, messages }];
            });
        }
        setMessages([]);
        if (!incognitoMode) setCurrentChatId('');
        setStreamingContent('');
        setSelectedModel(id);
        const isImage = MODEL_PROVIDERS.image.some(p => p.models.some(m => m.id === id));
        const isSearch = MODEL_PROVIDERS.search.some(p => p.models.some(m => m.id === id));
        setCurrentModality(isImage ? 'image' : isSearch ? 'search' : 'text');
        selectModel(id);
    }, [selectModel, messages, currentChatId, selectedModel, incognitoMode]);

    const handleSubmit = useCallback((e) => {
        e.preventDefault();
        if ((!input.trim() && !editTarget && attachedFiles.length === 0 && attachedImages.length === 0) || !isReady || isStreaming) return;

        const content = editTarget ? `EDIT IMAGE (${editTarget.url}): ${input || 'Make improvements to this image.'}` : input;
        const userMessage = {
            role: 'user',
            content: input || 'Edit Image',
            timestamp: new Date(),
            attachment: editTarget?.url,
            attachedFiles: [...attachedFiles],
            attachedImages: [...attachedImages]
        };

        // Build the complete message to send
        let messageToSend = content;

        // Add file contents (code files are still text)
        if (attachedFiles.length > 0) {
            const fileContents = attachedFiles.map((file, i) =>
                `FILE ${i + 1}: ${file.name}:\n\`\`\`${file.extension}\n${file.content}\n\`\`\``
            ).join('\n\n');
            messageToSend = fileContents + '\n\n' + messageToSend;
        }

        // Prepare attachments payload
        const attachments = [];
        if (attachedImages.length > 0) {
            attachedImages.forEach(img => {
                attachments.push({
                    type: 'image',
                    base64: img.url,
                    name: img.name
                });
            });
            // We DON'T add text placeholders anymore because we are uploading the real files
        }

        const isFirstMessage = messages.length === 0 && !isStreaming;

        if (isFirstMessage && (currentModality === 'text' || currentModality === 'search')) {
            // Get active personality from localStorage
            const storedP = localStorage.getItem('grove_personalities');
            const personalities = storedP ? JSON.parse(storedP) : [];
            const activeP = personalities.find(p => p.id === activePersonalityId);

            // Only prepend instruction if we have a non-default personality
            if (activeP && activeP.id !== 'standard') {
                messageToSend = `[System: ${activeP.prompt}]\n\n${messageToSend}`;
            }

            // Add branch context if present
            if (branchContext) {
                messageToSend = `[Previous conversation context:\n${branchContext}]\n\nContinuing conversation:\n\n${messageToSend}`;
                setBranchContext('');
            }
        }

        console.log('[ChatBox] Sending combined message:', messageToSend.substring(0, 200) + '...');
        console.log('[ChatBox] Attachments:', attachments.length);

        setMessages(prev => [...prev, userMessage]);
        sendMessage(messageToSend, Date.now().toString(), attachments);
        setInput('');
        setEditTarget(null);
        setAttachedFiles([]);
        setAttachedImages([]);
        inputRef.current?.focus();
    }, [input, isReady, isStreaming, sendMessage, messages, currentModality, editTarget, activePersonalityId, branchContext, attachedFiles, attachedImages]);


    const startNewChat = useCallback(() => {
        if (!incognitoMode && messages.length > 0 && currentChatId) {
            setChatHistory(prev => {
                const exists = prev.find(c => c.id === currentChatId);
                if (exists) return prev.map(c => c.id === currentChatId ? { ...c, messages } : c);
                return [...prev, { id: currentChatId, title: messages[0]?.content?.substring(0, 30) || 'New Chat', model: selectedModel, messages }];
            });
        }
        setMessages([]);
        if (!incognitoMode) setCurrentChatId('');
        setStreamingContent('');
        setBranchContext('');
        loadChatBackend('');
    }, [messages, currentChatId, selectedModel, loadChatBackend, incognitoMode]);

    const handleGeneratePersonalityPrompt = async (idea) => {
        return new Promise((resolve, reject) => {
            const hiddenMsg = `Act as an expert AI system prompt engineer. Create a highly detailed and effective system prompt for an AI personality based on this core idea: "${idea}". The system prompt should define the tone, expertise, and constraints of the personality. Respond ONLY with the system prompt text, no pleasantries.`;

            const onComplete = (data) => {
                socket.off('messageComplete', onComplete);
                setMessages(prev => prev.slice(0, -1));
                resolve(data.response);
            };

            socket.on('messageComplete', onComplete);
            sendMessage(hiddenMsg, 'personality-gen-' + Date.now());
        });
    };

    const deleteChat = (id) => { setChatHistory(prev => prev.filter(c => c.id !== id)); if (currentChatId === id) startNewChat(); setActiveMenu(null); };

    const exportToMarkdown = (chat) => {
        const content = chat.messages.map(m => `### ${m.role === 'user' ? 'You' : 'AI'}\n\n${m.content}\n\n---`).join('\n\n');
        const blob = new Blob([content], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${chat.title || 'chat'}.md`;
        a.click();
        URL.revokeObjectURL(url);
        setActiveMenu(null);
    };

    const branchChat = (chat) => {
        // 1. Generate Context
        const context = chat.messages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n---\n\n');
        setBranchContext(context);

        // 2. Setup New Chat State
        setMessages([]);
        setCurrentChatId('');
        setStreamingContent('');

        // 3. Open Model Selector (Simulated by keeping existing state)
        setActiveMenu(null);
        alert("Branch created! Pick a new model if desired, then send a message to continue with context.");
    };

    const loadChat = useCallback((chat) => { setIncognitoMode(false); setMessages(chat.messages); setCurrentChatId(chat.id); if (chat.model) setSelectedModel(chat.model); loadChatBackend(chat.id); }, [loadChatBackend]);

    const toggleIncognito = () => { if (!incognitoMode) startNewChat(); setIncognitoMode(!incognitoMode); };

    return (
        <div className={`chat-layout ${incognitoMode ? 'incognito-active' : ''}`}>
            <aside className={`chat-sidebar ${sidebarOpen ? 'open' : 'closed'}`}>
                <div className="sidebar-header">
                    <div className="sidebar-header-top">
                        <div className="brand-wrapper">
                            <img src="/assets/logo.png" className="brand-logo-img" alt="Grove" />
                            <span className="brand-text">STUDIO</span>
                        </div>
                        {sidebarOpen && (
                            <button className="sidebar-toggle-top" onClick={() => setSidebarOpen(false)}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
                            </button>
                        )}
                    </div>

                    {sidebarOpen && (
                        <button className="new-chat-action-btn" onClick={startNewChat} title="New Chat">
                            <img src="/assets/new-chat.png" className="btn-icon-img" alt="New Chat" />
                        </button>
                    )}
                </div>

                {!sidebarOpen && (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px', padding: '20px 0' }}>
                        <button className="new-chat-action-btn" onClick={startNewChat}>
                            <img src="/assets/new-chat.png" className="btn-icon-img" alt="" />
                        </button>
                        <button className="sidebar-toggle-top" onClick={() => setSidebarOpen(true)}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                        </button>
                    </div>
                )}

                <div className="sidebar-nav primary-nav">
                    <button className="chat-item" onClick={() => setShowLibrary(true)}>
                        <img src="/assets/gallery.png" className="item-icon-img" alt="G" />
                        <span className="chat-title">Library</span>
                    </button>
                    <button className="chat-item" onClick={() => setShowPersonalities(true)}>
                        <svg className="item-icon-img" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
                        </svg>
                        <span className="chat-title">Personalities</span>
                    </button>
                </div>

                <div className="sidebar-separator"></div>

                <div className="chat-list">
                    {!incognitoMode && chatHistory.map(chat => (
                        <div key={chat.id} className={`chat-item-wrapper ${chat.id === currentChatId ? 'active' : ''}`}>
                            <div className="chat-item" onClick={() => loadChat(chat)}>
                                <img src="/assets/chat-item.png" className="item-icon-img" alt="C" />
                                <span className="chat-title">{chat.title || 'Untitled Chat'}</span>
                            </div>
                            {sidebarOpen && (
                                <div className="chat-item-menu-trigger">
                                    <button onClick={(e) => { e.stopPropagation(); setActiveMenu(activeMenu === chat.id ? null : chat.id); }}>
                                        <img src="/assets/dots.png" style={{ width: '20px', height: '20px' }} alt="..." />
                                    </button>
                                    {activeMenu === chat.id && (
                                        <div className="context-menu">
                                            <button onClick={() => exportToMarkdown(chat)}>Save as .md</button>
                                            <button onClick={() => branchChat(chat)}>Branch Chat</button>
                                            <button className="delete" onClick={() => deleteChat(chat.id)}>Delete</button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </aside>

            <div className="chat-container">
                <header className="chat-header">
                    {!sidebarOpen && (
                        <button className="sidebar-toggle-top" style={{ marginRight: '10px' }} onClick={() => setSidebarOpen(true)}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                        </button>
                    )}
                    <ModelSelector selectedModel={selectedModel} onSelectModel={handleModelChange} disabled={!isReady || isStreaming} />

                    <div className="header-right-actions">
                        <button className={`incognito-toggle-btn ${incognitoMode ? 'active' : ''}`} onClick={toggleIncognito}>
                            <img src="/assets/incognito.png" alt="" />
                            <span>Incognito</span>
                        </button>
                    </div>
                </header>

                <main className="messages-container">
                    {messages.length === 0 && !streamingContent && (
                        <div className="empty-state">
                            <div className="empty-icon">
                                <img src={incognitoMode ? "/assets/incognito.png" : "/assets/logo.png"} alt="" />
                            </div>
                            <h2 style={{ fontWeight: 800, color: 'var(--accent)', fontSize: '28px' }}>
                                {incognitoMode ? 'Incognito Session' : branchContext ? 'Continue Chat Branch' : "What's the plan for today?"}
                            </h2>
                        </div>
                    )}

                    {messages.map((msg, idx) => {
                        const icon = MODEL_ICONS.getIconForModel(selectedModel);
                        const isUrl = MODEL_ICONS.isIconUrl(icon);

                        // Extract HTML blocks for canvas display
                        const htmlBlocks = msg.role === 'assistant' ? extractHtmlBlocks(msg.content) : [];
                        const displayContent = htmlBlocks.length > 0
                            ? getContentWithoutHtmlBlocks(msg.content, htmlBlocks)
                            : msg.content;

                        return (
                            <div key={idx} className={`message ${msg.role}`}>
                                {msg.role === 'assistant' && (
                                    isUrl
                                        ? <img className="message-avatar" src={icon} alt="" />
                                        : <span className="message-avatar" dangerouslySetInnerHTML={{ __html: icon }} />
                                )}
                                <div className="message-content">
                                    {msg.attachment && <img src={msg.attachment} alt="Context" className="chat-attachment-img" />}

                                    {/* Render markdown content */}
                                    <Markdown components={{
                                        img: ({ node, ...props }) => <img {...props} style={{ maxWidth: '100%', borderRadius: '12px' }} />,
                                        code: ({ node, inline, ...props }) => inline ? <code {...props} /> : <pre><code {...props} /></pre>
                                    }}>{displayContent}</Markdown>

                                    {/* Render HTML code canvases */}
                                    {htmlBlocks.map((block, blockIdx) => (
                                        <CodeCanvas
                                            key={blockIdx}
                                            code={block.code}
                                            language="html"
                                        />
                                    ))}
                                </div>
                            </div>
                        );
                    })}

                    {isStreaming && (() => {
                        const icon = MODEL_ICONS.getIconForModel(selectedModel);
                        const isUrl = MODEL_ICONS.isIconUrl(icon);

                        // Extract HTML blocks from streaming content
                        const streamHtmlBlocks = extractHtmlBlocks(streamingContent);
                        const streamDisplayContent = streamHtmlBlocks.length > 0
                            ? getContentWithoutHtmlBlocks(streamingContent, streamHtmlBlocks)
                            : streamingContent;

                        return (
                            <div className="message assistant streaming">
                                {isUrl
                                    ? <img className="message-avatar" src={icon} alt="" />
                                    : <span className="message-avatar" dangerouslySetInnerHTML={{ __html: icon }} />
                                }
                                <div className="message-content">
                                    {streamingContent ? (
                                        <>
                                            <Markdown>{streamDisplayContent}</Markdown>
                                            {streamHtmlBlocks.map((block, blockIdx) => (
                                                <CodeCanvas
                                                    key={blockIdx}
                                                    code={block.code}
                                                    language="html"
                                                />
                                            ))}
                                        </>
                                    ) : (
                                        <span className="loading-dots">...</span>
                                    )}
                                </div>
                            </div>
                        );
                    })()}
                    <div ref={messagesEndRef} />
                </main>

                <footer className="input-container">
                    {/* Hidden file inputs */}
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileSelect}
                        accept=".txt,.js,.jsx,.ts,.tsx,.py,.html,.css,.json,.md,.xml,.yaml,.yml,.sh,.bat,.ps1,.sql,.java,.c,.cpp,.h,.hpp,.cs,.go,.rs,.rb,.php,.swift,.kt"
                        multiple
                        style={{ display: 'none' }}
                    />
                    <input
                        type="file"
                        ref={imageInputRef}
                        onChange={handleImageSelect}
                        accept="image/*"
                        multiple
                        style={{ display: 'none' }}
                    />

                    <div className="input-with-preview">
                        {editTarget && (
                            <div className="edit-target-preview">
                                <img src={editTarget.url} alt="" />
                                <span>Editing Image</span>
                                <button type="button" onClick={() => setEditTarget(null)}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                </button>
                            </div>
                        )}

                        {/* Attachments Preview */}
                        {(attachedFiles.length > 0 || attachedImages.length > 0) && (
                            <div className="attachments-preview-bar">
                                {attachedFiles.map((file, i) => (
                                    <div key={`file-${i}`} className="attachment-chip">
                                        <span>📄 {file.name}</span>
                                        <button type="button" onClick={() => removeAttachedFile(i)}>×</button>
                                    </div>
                                ))}
                                {attachedImages.map((img, i) => (
                                    <div key={`img-${i}`} className="attachment-chip image-chip">
                                        <img src={img.dataUrl} alt="" />
                                        <span>{img.name}</span>
                                        <button type="button" onClick={() => removeAttachedImage(i)}>×</button>
                                    </div>
                                ))}
                            </div>
                        )}

                        <form onSubmit={handleSubmit} className="input-form">
                            {/* Attachment buttons */}
                            <div className="attach-buttons">
                                <button type="button" className="attach-btn" onClick={() => imageInputRef.current?.click()} title="Attach image">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                        <circle cx="8.5" cy="8.5" r="1.5" />
                                        <polyline points="21 15 16 10 5 21" />
                                    </svg>
                                </button>
                                <button type="button" className="attach-btn" onClick={() => fileInputRef.current?.click()} title="Attach file">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                        <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                                    </svg>
                                </button>
                            </div>

                            <textarea
                                ref={inputRef}
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(e); } }}
                                placeholder={isStreaming ? "Thinking..." : branchContext ? "Continue from history..." : "Message Grove..."}
                                disabled={!isReady || isStreaming}
                                className="chat-input"
                                rows={1}
                            />

                            <button type="button" className={`voice-pill ${voiceModeEnabled ? 'active' : ''}`} onClick={() => { setVoiceModeEnabled(!voiceModeEnabled); if (speaking) window.speechSynthesis.cancel(); }}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="4" y1="10" x2="4" y2="14" /><line x1="9" y1="6" x2="9" y2="18" /><line x1="14" y1="8" x2="14" y2="16" /><line x1="19" y1="11" x2="19" y2="13" /></svg>
                                <span>Voice</span>
                            </button>

                            <button type="submit" disabled={!isReady || isStreaming || (input.trim() === '' && !editTarget && attachedFiles.length === 0 && attachedImages.length === 0)} className="send-button">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg>
                            </button>
                        </form>
                    </div>
                </footer>
            </div>

            {showLibrary && (
                <ImageLibrary
                    images={savedImages}
                    onClose={() => setShowLibrary(false)}
                    onDelete={deleteImage}
                    onEditInModel={(img) => { setShowLibrary(false); setEditTarget(img); handleModelChange("qwen-image-edit"); inputRef.current?.focus(); }}
                />
            )}

            {showPersonalities && (
                <PersonalityManager
                    activeId={activePersonalityId}
                    onSelect={(id) => { setActivePersonalityId(id); setShowPersonalities(false); }}
                    onClose={() => setShowPersonalities(false)}
                    onGenerateRequest={handleGeneratePersonalityPrompt}
                />
            )}
        </div>
    );
}

export default ChatBox;
