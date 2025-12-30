import { useState } from 'react';

function ImageLibrary({ images, onClose, onDelete, onEditInModel }) {
    const [confirmDelete, setConfirmDelete] = useState(null);

    const downloadImage = async (url) => {
        try {
            const response = await fetch(url);
            const blob = await response.blob();
            const blobUrl = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = `lmarena-${Date.now()}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(blobUrl);
        } catch (error) {
            console.error('Download failed', error);
            // Fallback
            window.open(url, '_blank');
        }
    };

    return (
        <div className="library-overlay">
            <div className="library-modal">
                <div className="library-header">
                    <h2>Grove Collection</h2>
                    <button className="close-btn" onClick={onClose} aria-label="Close">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>

                <div className="library-grid">
                    {images.length === 0 ? (
                        <div className="no-images">
                            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: '16px' }}>
                                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                                <circle cx="8.5" cy="8.5" r="1.5"></circle>
                                <polyline points="21 15 16 10 5 21"></polyline>
                            </svg>
                            <p>Your creative journey starts here.</p>
                        </div>
                    ) : (
                        images.map((img, idx) => (
                            <div key={img.url + idx} className="library-item">
                                <img src={img.url} alt={`Generated AI artwork`} loading="lazy" />
                                <div className="item-actions">
                                    <button className="action-btn" onClick={() => downloadImage(img.url)}>
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                            <polyline points="7 10 12 15 17 10"></polyline>
                                            <line x1="12" y1="15" x2="12" y2="3"></line>
                                        </svg>
                                        Save
                                    </button>
                                    <button className="action-btn" onClick={() => onEditInModel(img)}>
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                                        </svg>
                                        Edit
                                    </button>
                                    <button className="action-btn delete" onClick={() => setConfirmDelete(img)}>
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                            <polyline points="3 6 5 6 21 6"></polyline>
                                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {confirmDelete && (
                <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
                    <h3>Remove work?</h3>
                    <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginTop: '8px' }}>
                        This will permanently remove this image from your local gallery.
                    </p>
                    <div className="confirm-btns">
                        <button className="cancel" onClick={() => setConfirmDelete(null)}>Keep</button>
                        <button className="delete-confirm" onClick={() => {
                            onDelete(confirmDelete.url);
                            setConfirmDelete(null);
                        }}>Remove</button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default ImageLibrary;
