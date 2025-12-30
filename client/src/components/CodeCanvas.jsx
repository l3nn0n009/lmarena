import { useState, useMemo } from 'react';
import Editor from '@monaco-editor/react';
import './CodeCanvas.css';

/**
 * CodeCanvas - A component that displays HTML/code with a Monaco editor and live preview
 * 
 * @param {string} code - The HTML/code content to display
 * @param {string} language - The language for syntax highlighting (default: 'html')
 * @param {function} onClose - Optional callback when the canvas is closed
 */
function CodeCanvas({ code, language = 'html', onClose }) {
    const [activeTab, setActiveTab] = useState('preview');
    const [isExpanded, setIsExpanded] = useState(false);

    // Format the code for display
    const formattedCode = useMemo(() => {
        try {
            // Basic HTML formatting/beautification
            if (language === 'html') {
                return code
                    .replace(/></g, '>\n<')
                    .replace(/\n\s*\n/g, '\n')
                    .trim();
            }
            return code;
        } catch (e) {
            return code;
        }
    }, [code, language]);

    // Create a safe preview URL using data URI
    const previewSrc = useMemo(() => {
        // Wrap the HTML in a full document if it's just a snippet
        let htmlContent = code;
        if (!code.includes('<html') && !code.includes('<!DOCTYPE')) {
            htmlContent = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        * { box-sizing: border-box; }
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 0;
            padding: 16px;
            background: #fff;
            color: #333;
        }
    </style>
</head>
<body>
${code}
</body>
</html>`;
        }
        return `data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`;
    }, [code]);

    // Copy code to clipboard
    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(code);
            // Could add a toast notification here
        } catch (e) {
            console.error('Failed to copy:', e);
        }
    };

    // Download as HTML file
    const handleDownload = () => {
        const blob = new Blob([code], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'code.html';
        a.click();
        URL.revokeObjectURL(url);
    };

    // Open in new tab
    const handleOpenExternal = () => {
        const newWindow = window.open();
        if (newWindow) {
            newWindow.document.write(code);
            newWindow.document.close();
        }
    };

    return (
        <div className={`code-canvas ${isExpanded ? 'expanded' : ''}`}>
            <div className="canvas-header">
                <div className="canvas-tabs">
                    <button
                        className={`canvas-tab ${activeTab === 'preview' ? 'active' : ''}`}
                        onClick={() => setActiveTab('preview')}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="3" y="3" width="18" height="18" rx="2" />
                            <path d="M3 9h18" />
                        </svg>
                        Preview
                    </button>
                    <button
                        className={`canvas-tab ${activeTab === 'code' ? 'active' : ''}`}
                        onClick={() => setActiveTab('code')}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="16 18 22 12 16 6" />
                            <polyline points="8 6 2 12 8 18" />
                        </svg>
                        Code
                    </button>
                </div>

                <div className="canvas-actions">
                    <button className="canvas-action-btn" onClick={handleCopy} title="Copy code">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="9" y="9" width="13" height="13" rx="2" />
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                        </svg>
                    </button>
                    <button className="canvas-action-btn" onClick={handleDownload} title="Download">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="7 10 12 15 17 10" />
                            <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                    </button>
                    <button className="canvas-action-btn" onClick={handleOpenExternal} title="Open in new tab">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                            <polyline points="15 3 21 3 21 9" />
                            <line x1="10" y1="14" x2="21" y2="3" />
                        </svg>
                    </button>
                    <button
                        className="canvas-action-btn"
                        onClick={() => setIsExpanded(!isExpanded)}
                        title={isExpanded ? "Minimize" : "Expand"}
                    >
                        {isExpanded ? (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="4 14 10 14 10 20" />
                                <polyline points="20 10 14 10 14 4" />
                                <line x1="14" y1="10" x2="21" y2="3" />
                                <line x1="3" y1="21" x2="10" y2="14" />
                            </svg>
                        ) : (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="15 3 21 3 21 9" />
                                <polyline points="9 21 3 21 3 15" />
                                <line x1="21" y1="3" x2="14" y2="10" />
                                <line x1="3" y1="21" x2="10" y2="14" />
                            </svg>
                        )}
                    </button>
                    {onClose && (
                        <button className="canvas-action-btn close" onClick={onClose} title="Close">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                        </button>
                    )}
                </div>
            </div>

            <div className="canvas-content">
                {activeTab === 'preview' ? (
                    <iframe
                        className="canvas-preview"
                        src={previewSrc}
                        title="Preview"
                        sandbox="allow-scripts allow-same-origin"
                    />
                ) : (
                    <Editor
                        height="100%"
                        language={language}
                        value={formattedCode}
                        theme="vs-dark"
                        options={{
                            readOnly: true,
                            minimap: { enabled: false },
                            fontSize: 13,
                            lineNumbers: 'on',
                            scrollBeyondLastLine: false,
                            wordWrap: 'on',
                            automaticLayout: true,
                            padding: { top: 12, bottom: 12 },
                            folding: true,
                            renderLineHighlight: 'none',
                        }}
                    />
                )}
            </div>
        </div>
    );
}

export default CodeCanvas;
