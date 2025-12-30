import { useState, useEffect, useRef, useCallback } from 'react';
import Markdown from 'react-markdown';
import useSocket from '../hooks/useSocket';
import ModelSelector from './ModelSelector';
import CodeCanvas from './CodeCanvas';
import { MODEL_PROVIDERS } from '../constants/models';
import { MODEL_ICONS } from '../constants/modelIcons';
import './MobileChatBox.css';

// Helper function to check if code looks like HTML
function looksLikeHtml(code) {
    const trimmed = code.trim();
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

    if (trimmed.startsWith('<') && (trimmed.includes('</') || trimmed.includes('/>'))) {
        if (/<(html|head|body|div|span|p|h[1-6]|section|article|header|footer|nav|main|form|input|button|a|img|ul|ol|li|table|tr|td|th|style|script|link|meta)[\s>]/i.test(trimmed)) {
            return true;
        }
    }

    return htmlPatterns.some(pattern => pattern.test(trimmed));
}

function extractHtmlBlocks(content) {
    const htmlBlocks = [];
    const codeBlockRegex = /```(html|htm)?\s*\n([\s\S]*?)```/gi;
    let match;

    while ((match = codeBlockRegex.exec(content)) !== null) {
        const language = match[1];
        const code = match[2].trim();
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

function getContentWithoutHtmlBlocks(content, htmlBlocks) {
    if (htmlBlocks.length === 0) return content;
    let result = content;
    htmlBlocks.forEach((block, i) => {
        result = result.replace(block.fullMatch, `\n**[Canvas ${i + 1}]**\n`);
    });
    return result;
}

// Extract image URLs from content
function extractImageUrls(content) {
    const urls = [];
    const mdImageRegex = /!\[.*?\]\((.*?)\)/g;
    let match;
    while ((match = mdImageRegex.exec(content)) !== null) {
        if (match[1] && !match[1].startsWith('data:')) {
            urls.push(match[1]);
        }
    }
    return urls;
}

function MobileChatBox() {
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [isStreaming, setIsStreaming] = useState(false);
    const [isSending, setIsSending] = useState(false);
    const [streamingContent, setStreamingContent] = useState('');
    const [selectedModel, setSelectedModel] = useState('gpt-image-1.5');
    const [currentModality, setCurrentModality] = useState('text');
    const [generationStartTime, setGenerationStartTime] = useState(null);
    const [elapsedTime, setElapsedTime] = useState('0.0');

    useEffect(() => {
        let interval;
        if (generationStartTime && (isSending || isStreaming)) {
            interval = setInterval(() => {
                setElapsedTime(((Date.now() - generationStartTime) / 1000).toFixed(1));
            }, 100);
        } else if (!isSending && !isStreaming) {
            setGenerationStartTime(null);
            setElapsedTime('0.0');
        }
        return () => clearInterval(interval);
    }, [generationStartTime, isSending, isStreaming]);
    const [currentChatId, setCurrentChatId] = useState('');
    const [showModelSelector, setShowModelSelector] = useState(false);
    const [showMenu, setShowMenu] = useState(false);
    const [savedImages, setSavedImages] = useState([]);
    const [incognitoMode, setIncognitoMode] = useState(false);

    // Image editing state
    const [editingImage, setEditingImage] = useState(null);
    const [showImageViewer, setShowImageViewer] = useState(null);
    const [showImageLibrary, setShowImageLibrary] = useState(false);

    // File attachments
    const [attachedFiles, setAttachedFiles] = useState([]);
    const [attachedImages, setAttachedImages] = useState([]);

    // Background Keep-Alive Audio Ref
    const audioRef = useRef(null);
    const SILENT_AUDIO = "data:audio/wav;base64,UklGRjIAAABXQVZFZm10IBIAAAABAAEAQB8AAEAfAAABAAgAAABmYWN0BAAAAAAAAABkYXRhAAAAAA==";

    const messagesEndRef = useRef(null);
    const inputRef = useRef(null);
    const fileInputRef = useRef(null);
    const imageInputRef = useRef(null);

    const { isConnected, isReady, status, sendMessage, selectModel, loadChat: loadChatBackend, socket } = useSocket();

    // Persistence
    useEffect(() => {
        const stored = localStorage.getItem('lmarena_images');
        if (stored) setSavedImages(JSON.parse(stored));
    }, []);

    const saveImageToLibrary = useCallback((url, chatId) => {
        setSavedImages(prev => {
            if (prev.find(img => img.url === url)) return prev;
            const newImages = [{ url, chatId: chatId || 'incognito', timestamp: Date.now() }, ...prev];
            localStorage.setItem('lmarena_images', JSON.stringify(newImages));
            return newImages;
        });
    }, []);

    // Download image to device
    const downloadImage = async (imageUrl, filename = 'grove-image.png') => {
        try {
            const response = await fetch(imageUrl);
            const blob = await response.blob();

            // Try native sharing first (Mobile "Save to Photos" experience)
            const file = new File([blob], filename, { type: blob.type });
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                try {
                    await navigator.share({
                        files: [file],
                        title: 'Grove Image',
                        text: 'Generated by Grove AI Studio'
                    });
                    return; // Successfully shared/saved via native sheet
                } catch (shareError) {
                    console.log('Share dismissed or failed, falling back to download', shareError);
                }
            }

            // Fallback: Force download
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
            // Fallback: open in new tab
            window.open(imageUrl, '_blank');
        }
    };

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => { scrollToBottom(); }, [messages, streamingContent]);

    // Socket Logic
    useEffect(() => {
        if (!socket) return;
        const handleMessageStart = () => {
            setIsStreaming(true);
            setIsSending(false);
            setStreamingContent('');
        };
        const handleToken = (data) => {
            if (data.fullText) setStreamingContent(data.fullText);
            if (data.imageUrl) saveImageToLibrary(data.imageUrl, data.chatId);
            if (data.chatId && !incognitoMode) setCurrentChatId(data.chatId);
        };
        const handleMessageComplete = (data) => {
            setIsStreaming(false);
            setIsSending(false); // Ensure lock is released

            // Stop background keep-alive
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current.currentTime = 0;
            }

            const imgMatch = data.response.match(/!\[.*?\]\((.*?)\)/);
            if (imgMatch && imgMatch[1]) saveImageToLibrary(imgMatch[1], data.chatId);
            setMessages(prev => [...prev, { role: 'assistant', content: data.response, chatId: data.chatId, timestamp: new Date() }]);
            setStreamingContent('');
            if (data.chatId && !incognitoMode) setCurrentChatId(data.chatId);
        };
        const handleError = () => {
            setIsStreaming(false);
            setIsSending(false);
            if (audioRef.current) {
                audioRef.current.pause();
                audioRef.current.currentTime = 0;
            }
        };

        socket.on('messageStart', handleMessageStart);
        socket.on('token', handleToken);
        socket.on('messageComplete', handleMessageComplete);
        socket.on('error', handleError);

        return () => {
            socket.off('messageStart', handleMessageStart);
            socket.off('token', handleToken);
            socket.off('messageComplete', handleMessageComplete);
            socket.off('error', handleError);
        };
    }, [socket, saveImageToLibrary, incognitoMode]);

    const handleModelChange = useCallback((id) => {
        // Don't clear messages if we're editing an image
        if (!editingImage) {
            setMessages([]);
        }
        if (!incognitoMode) setCurrentChatId('');
        setStreamingContent('');
        setSelectedModel(id);
        const isImage = MODEL_PROVIDERS.image.some(p => p.models.some(m => m.id === id));
        const isSearch = MODEL_PROVIDERS.search.some(p => p.models.some(m => m.id === id));
        setCurrentModality(isImage ? 'image' : isSearch ? 'search' : 'text');
        selectModel(id);
        setShowModelSelector(false);
    }, [selectModel, incognitoMode, editingImage]);

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

    const handleSubmit = useCallback((e) => {
        e.preventDefault();
        if ((!input.trim() && !editingImage && attachedFiles.length === 0 && attachedImages.length === 0) || !isReady || isStreaming || isSending) return;

        setIsSending(true); // Lock interface immediately
        setGenerationStartTime(Date.now());

        // Start silent audio to keep background connection alive
        if (audioRef.current) {
            audioRef.current.play().catch(e => console.log("Audio play failed (interaction needed first):", e));
        }

        // Build the complete message
        let messageContent = input;

        // Add file contents
        if (attachedFiles.length > 0) {
            const fileContents = attachedFiles.map((file, i) =>
                `FILE ${i + 1}: ${file.name}:\n\`\`\`${file.extension}\n${file.content}\n\`\`\``
            ).join('\n\n');
            messageContent = fileContents + '\n\n' + messageContent;
        }

        // Prepare attachments payload
        const attachments = [];
        if (attachedImages.length > 0) {
            attachedImages.forEach(img => {
                attachments.push({
                    type: 'image',
                    base64: img.dataUrl,
                    name: img.name
                });
            });
            // We DON'T add text placeholders anymore because we are uploading the real files
        }

        // Add editing context
        if (editingImage) {
            messageContent = `EDIT IMAGE (${editingImage}): ${input || 'Make improvements to this image.'}`;
        }

        const userMessage = {
            role: 'user',
            content: input || 'Edit Image',
            timestamp: new Date(),
            attachedFiles: [...attachedFiles],
            attachedImages: [...attachedImages],
            editingImage: editingImage
        };

        setMessages(prev => [...prev, userMessage]);
        sendMessage(messageContent, Date.now().toString(), attachments);
        setInput('');
        setAttachedFiles([]);
        setAttachedImages([]);
        setEditingImage(null);
        inputRef.current?.focus();
    }, [input, isReady, isStreaming, isSending, sendMessage, editingImage, attachedFiles, attachedImages]);

    const startNewChat = useCallback(() => {
        setMessages([]);
        if (!incognitoMode) setCurrentChatId('');
        setStreamingContent('');
        setEditingImage(null);
        setAttachedFiles([]);
        setAttachedImages([]);
        loadChatBackend('');
        setShowMenu(false);
    }, [loadChatBackend, incognitoMode]);

    const toggleIncognito = () => {
        if (!incognitoMode) startNewChat();
        setIncognitoMode(!incognitoMode);
        setShowMenu(false);
    };

    // Start editing an image
    const startImageEdit = (imageUrl) => {
        setShowImageViewer(null);
        setShowImageLibrary(false);
        setEditingImage(imageUrl);
        setShowModelSelector(true); // Let user pick the model
        inputRef.current?.focus();
    };

    // Delete image from library
    const deleteImageFromLibrary = (url) => {
        setSavedImages(prev => {
            const newImages = prev.filter(img => img.url !== url);
            localStorage.setItem('lmarena_images', JSON.stringify(newImages));
            return newImages;
        });
        setShowImageViewer(null);
    };

    // Get current model display name
    const getModelDisplayName = () => {
        for (const modality of Object.values(MODEL_PROVIDERS)) {
            for (const provider of modality) {
                const model = provider.models.find(m => m.id === selectedModel);
                if (model) return model.name;
            }
        }
        return selectedModel;
    };

    const icon = MODEL_ICONS.getIconForModel(selectedModel);
    const isIconUrl = MODEL_ICONS.isIconUrl(icon);

    // Custom image renderer with click-to-view
    const ImageWithActions = ({ src, alt }) => {
        return (
            <div className="mobile-image-wrapper" onClick={() => setShowImageViewer(src)}>
                <img src={src} alt={alt || ''} />
                <div className="mobile-image-overlay">
                    <span>Tap to view</span>
                </div>
            </div>
        );
    };

    return (
        <div className={`mobile-chat-app ${incognitoMode ? 'incognito-active' : ''}`}>
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

            {/* Header */}
            <header className="mobile-header">
                <button className="mobile-menu-btn" onClick={() => setShowMenu(true)}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <line x1="3" y1="6" x2="21" y2="6" />
                        <line x1="3" y1="12" x2="21" y2="12" />
                        <line x1="3" y1="18" x2="21" y2="18" />
                    </svg>
                </button>

                <button className="mobile-model-btn" onClick={() => setShowModelSelector(true)}>
                    {isIconUrl
                        ? <img src={icon} alt="" className="mobile-model-icon" />
                        : <span className="mobile-model-icon" dangerouslySetInnerHTML={{ __html: icon }} />
                    }
                    <span className="mobile-model-name">{getModelDisplayName()}</span>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                        <polyline points="6 9 12 15 18 9" />
                    </svg>
                </button>

                <button
                    className={`mobile-incognito-btn ${incognitoMode ? 'active' : ''}`}
                    onClick={toggleIncognito}
                >
                    <img src="/assets/incognito.png" alt="" />
                </button>
            </header>

            {/* Slide-out Menu */}
            {showMenu && (
                <div className="mobile-menu-overlay" onClick={() => setShowMenu(false)}>
                    <div className="mobile-menu" onClick={e => e.stopPropagation()}>
                        <div className="mobile-menu-header">
                            <img src="/assets/logo.png" alt="Grove" className="mobile-menu-logo" />
                            <span>GROVE AI STUDIO</span>
                            <button className="mobile-menu-close" onClick={() => setShowMenu(false)}>
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                                    <line x1="18" y1="6" x2="6" y2="18" />
                                    <line x1="6" y1="6" x2="18" y2="18" />
                                </svg>
                            </button>
                        </div>

                        <button className="mobile-menu-item" onClick={startNewChat}>
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                <line x1="12" y1="5" x2="12" y2="19" />
                                <line x1="5" y1="12" x2="19" y2="12" />
                            </svg>
                            <span>New Chat</span>
                        </button>

                        <button className="mobile-menu-item" onClick={() => { setShowImageLibrary(true); setShowMenu(false); }}>
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                <circle cx="8.5" cy="8.5" r="1.5" />
                                <polyline points="21 15 16 10 5 21" />
                            </svg>
                            <span>Image Library ({savedImages.length})</span>
                        </button>

                        <button className="mobile-menu-item" onClick={toggleIncognito}>
                            <img src="/assets/incognito.png" alt="" style={{ width: 24, height: 24 }} />
                            <span>{incognitoMode ? 'Exit Incognito' : 'Incognito Mode'}</span>
                        </button>

                        <div className="mobile-menu-divider" />

                        <div className="mobile-menu-section-title">Quick Actions</div>

                        <button className="mobile-menu-item" onClick={() => { setShowMenu(false); handleModelChange('dall-e-3'); }}>
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                            </svg>
                            <span>Generate Image (DALL-E 3)</span>
                        </button>

                        <button className="mobile-menu-item" onClick={() => { setShowMenu(false); handleModelChange('imagen-3'); }}>
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                            </svg>
                            <span>Generate Image (Imagen 3)</span>
                        </button>

                        <div className="mobile-menu-status">
                            <div className={`status-dot ${isConnected ? 'connected' : ''}`} />
                            <span>{status?.message || (isConnected ? 'Connected' : 'Connecting...')}</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Model Selector Modal */}
            {showModelSelector && (
                <div className="mobile-modal-overlay" onClick={() => setShowModelSelector(false)}>
                    <div className="mobile-modal" onClick={e => e.stopPropagation()}>
                        <div className="mobile-modal-header">
                            <h3>{editingImage ? 'Select Model for Editing' : 'Select Model'}</h3>
                            <button onClick={() => setShowModelSelector(false)}>×</button>
                        </div>
                        {editingImage && (
                            <div className="mobile-edit-preview">
                                <img src={editingImage} alt="Editing" />
                                <span>Image ready for editing</span>
                            </div>
                        )}
                        <div className="mobile-modal-content">
                            <ModelSelector
                                selectedModel={selectedModel}
                                onSelectModel={handleModelChange}
                                disabled={!isReady || isStreaming}
                                isMobile={true}
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* Image Viewer Modal */}
            {showImageViewer && (
                <div className="mobile-modal-overlay" onClick={() => setShowImageViewer(null)}>
                    <div className="mobile-image-viewer" onClick={e => e.stopPropagation()}>
                        <div className="mobile-image-viewer-header">
                            <button onClick={() => setShowImageViewer(null)}>
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                                    <line x1="18" y1="6" x2="6" y2="18" />
                                    <line x1="6" y1="6" x2="18" y2="18" />
                                </svg>
                            </button>
                        </div>
                        <div className="mobile-image-viewer-content">
                            <img src={showImageViewer} alt="" style={{ pointerEvents: 'auto' }} />
                            <div style={{
                                textAlign: 'center',
                                marginTop: 12,
                                padding: '8px 16px',
                                backgroundColor: 'rgba(0, 0, 0, 0.6)',
                                color: 'white',
                                borderRadius: '20px',
                                display: 'inline-block',
                                fontSize: 13
                            }}>
                                Long press image to save to Photos
                            </div>
                        </div>
                        <div className="mobile-image-viewer-actions">
                            <button onClick={() => downloadImage(showImageViewer, `grove-image-${Date.now()}.png`)}>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                    <polyline points="7 10 12 15 17 10" />
                                    <line x1="12" y1="15" x2="12" y2="3" />
                                </svg>
                                <span>Save</span>
                            </button>
                            <button onClick={() => startImageEdit(showImageViewer)}>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                </svg>
                                <span>Edit</span>
                            </button>
                            <button onClick={() => { saveImageToLibrary(showImageViewer, currentChatId); setShowImageViewer(null); }}>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                                    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                                </svg>
                                <span>Library</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Image Library Modal */}
            {showImageLibrary && (
                <div className="mobile-modal-overlay" onClick={() => setShowImageLibrary(false)}>
                    <div className="mobile-modal mobile-library-modal" onClick={e => e.stopPropagation()}>
                        <div className="mobile-modal-header">
                            <h3>Image Library</h3>
                            <button onClick={() => setShowImageLibrary(false)}>×</button>
                        </div>
                        <div className="mobile-library-grid">
                            {savedImages.length === 0 ? (
                                <div className="mobile-library-empty">
                                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                        <circle cx="8.5" cy="8.5" r="1.5" />
                                        <polyline points="21 15 16 10 5 21" />
                                    </svg>
                                    <p>No saved images yet</p>
                                    <span>Generated images will appear here</span>
                                </div>
                            ) : (
                                savedImages.map((img, idx) => (
                                    <div key={idx} className="mobile-library-item" onClick={() => { setShowImageLibrary(false); setShowImageViewer(img.url); }}>
                                        <img src={img.url} alt="" />
                                        <div className="mobile-library-item-actions">
                                            <button onClick={(e) => { e.stopPropagation(); downloadImage(img.url); }}>
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                                    <polyline points="7 10 12 15 17 10" />
                                                    <line x1="12" y1="15" x2="12" y2="3" />
                                                </svg>
                                            </button>
                                            <button onClick={(e) => { e.stopPropagation(); startImageEdit(img.url); }}>
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                                </svg>
                                            </button>
                                            <button className="delete" onClick={(e) => { e.stopPropagation(); deleteImageFromLibrary(img.url); }}>
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                                    <polyline points="3 6 5 6 21 6" />
                                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                                </svg>
                                            </button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Messages */}
            <main className="mobile-messages">
                {messages.length === 0 && !streamingContent && (
                    <div className="mobile-empty-state">
                        <div className="mobile-empty-icon">
                            <img src={incognitoMode ? "/assets/incognito.png" : "/assets/logo.png"} alt="" />
                        </div>
                        <h2>{incognitoMode ? 'Incognito Mode' : "What's up?"}</h2>
                        <p>Send a message to start chatting</p>

                        <div className="mobile-quick-actions">
                            <button onClick={() => handleModelChange('dall-e-3')}>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                    <circle cx="8.5" cy="8.5" r="1.5" />
                                    <polyline points="21 15 16 10 5 21" />
                                </svg>
                                Generate Image
                            </button>
                            <button onClick={() => setShowImageLibrary(true)}>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                                </svg>
                                Library
                            </button>
                        </div>
                    </div>
                )}

                {messages.map((msg, idx) => {
                    const msgIcon = MODEL_ICONS.getIconForModel(selectedModel);
                    const isMsgIconUrl = MODEL_ICONS.isIconUrl(msgIcon);
                    const htmlBlocks = msg.role === 'assistant' ? extractHtmlBlocks(msg.content) : [];
                    const displayContent = htmlBlocks.length > 0
                        ? getContentWithoutHtmlBlocks(msg.content, htmlBlocks)
                        : msg.content;
                    const imageUrls = msg.role === 'assistant' ? extractImageUrls(msg.content) : [];

                    return (
                        <div key={idx} className={`mobile-message ${msg.role}`}>
                            {msg.role === 'assistant' && (
                                <div className="mobile-message-avatar">
                                    {isMsgIconUrl
                                        ? <img src={msgIcon} alt="" />
                                        : <span dangerouslySetInnerHTML={{ __html: msgIcon }} />
                                    }
                                </div>
                            )}
                            <div className="mobile-message-content">
                                {/* Show attached files preview */}
                                {msg.attachedFiles && msg.attachedFiles.length > 0 && (
                                    <div className="mobile-attached-files-preview">
                                        {msg.attachedFiles.map((file, i) => (
                                            <div key={i} className="mobile-attached-file-tag">
                                                📄 {file.name}
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Show attached images preview */}
                                {msg.attachedImages && msg.attachedImages.length > 0 && (
                                    <div className="mobile-attached-images-preview">
                                        {msg.attachedImages.map((img, i) => (
                                            <img key={i} src={img.dataUrl} alt={img.name} />
                                        ))}
                                    </div>
                                )}

                                {/* Show editing image */}
                                {msg.editingImage && (
                                    <div className="mobile-editing-image-preview">
                                        <img src={msg.editingImage} alt="Editing" />
                                        <span>✏️ Editing</span>
                                    </div>
                                )}

                                <Markdown components={{
                                    img: ImageWithActions,
                                    code: ({ node, inline, ...props }) => inline ? <code {...props} /> : <pre><code {...props} /></pre>
                                }}>{displayContent}</Markdown>

                                {htmlBlocks.map((block, blockIdx) => (
                                    <CodeCanvas key={blockIdx} code={block.code} language="html" />
                                ))}

                                {/* Image action buttons for generated images */}
                                {imageUrls.length > 0 && (
                                    <div className="mobile-image-actions-bar">
                                        {imageUrls.map((url, i) => (
                                            <div key={i} className="mobile-image-action-group">
                                                <button onClick={() => downloadImage(url, `image-${Date.now()}.png`)}>
                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                                        <polyline points="7 10 12 15 17 10" />
                                                        <line x1="12" y1="15" x2="12" y2="3" />
                                                    </svg>
                                                    Save
                                                </button>
                                                <button onClick={() => startImageEdit(url)}>
                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                                    </svg>
                                                    Edit
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}

                {isStreaming && (() => {
                    const streamIcon = MODEL_ICONS.getIconForModel(selectedModel);
                    const isStreamIconUrl = MODEL_ICONS.isIconUrl(streamIcon);
                    const streamHtmlBlocks = extractHtmlBlocks(streamingContent);
                    const streamDisplayContent = streamHtmlBlocks.length > 0
                        ? getContentWithoutHtmlBlocks(streamingContent, streamHtmlBlocks)
                        : streamingContent;

                    return (
                        <div className="mobile-message assistant streaming">
                            <div className="mobile-message-avatar">
                                {isStreamIconUrl
                                    ? <img src={streamIcon} alt="" />
                                    : <span dangerouslySetInnerHTML={{ __html: streamIcon }} />
                                }
                            </div>
                            <div className="mobile-message-content">
                                {streamingContent ? (
                                    <>
                                        <Markdown components={{
                                            img: ImageWithActions
                                        }}>{streamDisplayContent}</Markdown>
                                        {streamHtmlBlocks.map((block, blockIdx) => (
                                            <CodeCanvas key={blockIdx} code={block.code} language="html" />
                                        ))}
                                    </>
                                ) : (
                                    <div className="mobile-typing-indicator">
                                        <span></span><span></span><span></span>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })()}

                <div ref={messagesEndRef} />
            </main>

            {/* Input */}
            <footer className="mobile-input-container">
                {/* Editing image preview */}
                {editingImage && (
                    <div className="mobile-edit-banner">
                        <img src={editingImage} alt="" />
                        <span>Editing image...</span>
                        <button onClick={() => setEditingImage(null)}>×</button>
                    </div>
                )}

                {/* Attached files preview */}
                {(attachedFiles.length > 0 || attachedImages.length > 0) && (
                    <div className="mobile-attachments-bar">
                        {attachedFiles.map((file, i) => (
                            <div key={`file-${i}`} className="mobile-attachment-chip">
                                <span>📄 {file.name}</span>
                                <button onClick={() => removeAttachedFile(i)}>×</button>
                            </div>
                        ))}
                        {attachedImages.map((img, i) => (
                            <div key={`img-${i}`} className="mobile-attachment-chip image">
                                <img src={img.dataUrl} alt="" />
                                <button onClick={() => removeAttachedImage(i)}>×</button>
                            </div>
                        ))}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="mobile-input-form">
                    {/* Attachment buttons */}
                    <div className="mobile-attach-buttons">
                        <button type="button" onClick={() => imageInputRef.current?.click()} title="Attach image">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                <circle cx="8.5" cy="8.5" r="1.5" />
                                <polyline points="21 15 16 10 5 21" />
                            </svg>
                        </button>
                        <button type="button" onClick={() => fileInputRef.current?.click()} title="Attach file">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                            </svg>
                        </button>
                    </div>

                    <textarea
                        ref={inputRef}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSubmit(e);
                            }
                        }}
                        placeholder={
                            isStreaming ? `Generating... (${elapsedTime}s)` :
                                isSending ? `Sending... (${elapsedTime}s)` :
                                    editingImage ? "Describe changes to make..." :
                                        "Message Grove..."
                        }
                        disabled={!isReady || isStreaming || isSending}
                        className="mobile-input"
                        rows={1}
                    />
                    <button
                        type="submit"
                        disabled={!isReady || isStreaming || isSending || (!input.trim() && !editingImage && attachedFiles.length === 0 && attachedImages.length === 0)}
                        className="mobile-send-btn"
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="12" y1="19" x2="12" y2="5" />
                            <polyline points="5 12 12 5 19 12" />
                        </svg>
                    </button>
                </form>
            </footer>

            {/* Silent Audio for Background Persistence */}
            <audio ref={audioRef} src={SILENT_AUDIO} loop muted={false} style={{ display: 'none' }} />
        </div>
    );
}

export default MobileChatBox;
