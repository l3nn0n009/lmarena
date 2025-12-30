import { useState, useRef, useEffect } from 'react';
import { MODEL_PROVIDERS, ALL_MODELS } from '../constants/models';
import { MODEL_ICONS } from '../constants/modelIcons';

function ModelSelector({ selectedModel, onSelectModel, disabled, isMobile = false }) {
    const [isOpen, setIsOpen] = useState(isMobile); // Auto-open for mobile
    const [modality, setModality] = useState('text');
    const [hoveredProvider, setHoveredProvider] = useState(MODEL_PROVIDERS.text[0].id);
    const [searchQuery, setSearchQuery] = useState('');
    const [showSearch, setShowSearch] = useState(false);
    const containerRef = useRef(null);
    const searchInputRef = useRef(null);

    // Close when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (containerRef.current && !containerRef.current.contains(event.target)) {
                setIsOpen(false);
                setShowSearch(false);
                setSearchQuery('');
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Focus search input when search is opened
    useEffect(() => {
        if (showSearch && searchInputRef.current) {
            searchInputRef.current.focus();
        }
    }, [showSearch]);

    // Update hovered provider when modality changes
    useEffect(() => {
        const providers = MODEL_PROVIDERS[modality];
        if (providers && providers.length > 0) {
            setHoveredProvider(providers[0].id);
        }
    }, [modality]);

    const currentProviders = MODEL_PROVIDERS[modality];

    const getModelName = (id) => {
        for (const mod of ['text', 'image', 'search']) {
            for (const prov of MODEL_PROVIDERS[mod]) {
                const found = prov.models.find(m => m.id === id);
                if (found) return found.name;
            }
        }
        return id;
    };

    // Get provider icon - all icons are now data URIs or URLs
    const getProviderIcon = (providerId) => {
        const icon = MODEL_ICONS.getIcon(providerId);
        return <img className="provider-icon" src={icon} alt="" />;
    };

    // Get model icon based on its provider
    const getModelIcon = (modelId) => {
        const icon = MODEL_ICONS.getIconForModel(modelId);
        return <img className="model-icon" src={icon} alt="" />;
    };

    // Filter all models based on search query
    const filteredModels = searchQuery.trim()
        ? ALL_MODELS.filter(m =>
            m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            m.id.toLowerCase().includes(searchQuery.toLowerCase())
        )
        : [];

    const handleSearchSelect = (model) => {
        onSelectModel(model.id);
        setIsOpen(false);
        setShowSearch(false);
        setSearchQuery('');
    };

    const toggleSearch = () => {
        setShowSearch(!showSearch);
        if (showSearch) {
            setSearchQuery('');
        }
    };

    return (
        <div className="model-selector-wrapper" ref={containerRef}>
            <button
                className="model-selector-trigger"
                onClick={() => !disabled && setIsOpen(!isOpen)}
                disabled={disabled}
            >
                {getModelIcon(selectedModel)}
                <span className="selected-name">{getModelName(selectedModel) || 'Select Model'}</span>
                <span className="chevron">▼</span>
            </button>

            {isOpen && (
                <div className="model-dropdown">
                    {/* Search Toggle and Input */}
                    <div className="model-search-section">
                        <button
                            className={`model-search-toggle ${showSearch ? 'active' : ''}`}
                            onClick={toggleSearch}
                            title="Search models"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="11" cy="11" r="8"></circle>
                                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                            </svg>
                            <span>Search</span>
                        </button>
                        {showSearch && (
                            <input
                                ref={searchInputRef}
                                type="text"
                                className="model-search-input"
                                placeholder="Search all models..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                            />
                        )}
                    </div>

                    {/* Search Results */}
                    {showSearch && searchQuery.trim() && (
                        <div className="search-results-container">
                            {filteredModels.length > 0 ? (
                                <div className="search-results-list">
                                    {filteredModels.map(model => (
                                        <div
                                            key={model.id}
                                            className={`search-result-item ${selectedModel === model.id ? 'selected' : ''}`}
                                            onClick={() => handleSearchSelect(model)}
                                        >
                                            {getModelIcon(model.id)}
                                            <span className="search-result-name">{model.name}</span>
                                            <span className={`search-result-badge ${model.modality}`}>
                                                {model.modality}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="search-no-results">
                                    No models found for "{searchQuery}"
                                </div>
                            )}
                        </div>
                    )}

                    {/* Regular Model Selection (hidden during search) */}
                    {(!showSearch || !searchQuery.trim()) && (
                        <>
                            {/* Modality Toggle */}
                            <div className="modality-toggle">
                                <button
                                    className={`mod-btn ${modality === 'text' ? 'active' : ''}`}
                                    onClick={() => setModality('text')}
                                >
                                    Text
                                </button>
                                <button
                                    className={`mod-btn ${modality === 'image' ? 'active' : ''}`}
                                    onClick={() => setModality('image')}
                                >
                                    Image
                                </button>
                                <button
                                    className={`mod-btn ${modality === 'search' ? 'active' : ''}`}
                                    onClick={() => setModality('search')}
                                >
                                    🔍 Search
                                </button>
                            </div>

                            <div className="dropdown-content">
                                {/* Providers List */}
                                <div className="providers-column">
                                    {currentProviders.map(provider => (
                                        <div
                                            key={provider.id}
                                            className={`provider-item ${hoveredProvider === provider.id ? 'active' : ''}`}
                                            onMouseEnter={() => !isMobile && setHoveredProvider(provider.id)}
                                            onClick={() => setHoveredProvider(provider.id)}
                                        >
                                            {getProviderIcon(provider.id)}
                                            <span>{provider.name}</span>
                                            {!isMobile && <span className="arrow">›</span>}
                                        </div>
                                    ))}
                                </div>

                                {/* Models Submenu - Shows when a provider is hovered */}
                                {hoveredProvider && (
                                    <div className="models-column">
                                        {currentProviders.find(p => p.id === hoveredProvider)?.models.map(model => (
                                            <div
                                                key={model.id}
                                                className={`model-item ${selectedModel === model.id ? 'selected' : ''}`}
                                                onClick={() => {
                                                    onSelectModel(model.id);
                                                    setIsOpen(false);
                                                }}
                                            >
                                                {getModelIcon(model.id)}
                                                <span>{model.name}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

export default ModelSelector;
