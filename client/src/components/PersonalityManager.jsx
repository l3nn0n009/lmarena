import { useState, useEffect } from 'react';

const DEFAULT_PERSONALITIES = [
    { id: 'standard', name: 'Grove Standard', prompt: 'You must respond normally. Not necessarily referencing markdown. Exactly as you would in a normal conversation. Just properly formatted.' },
    { id: 'poet', name: 'Nature Poet', prompt: 'You are a wise spirit of the forest. Respond with poetic flair, referencing nature frequently.' },
    { id: 'engineer', name: 'Code Architect', prompt: 'You are a senior softare engineer. Be concise, use technical terminology, and provide high-quality code examples.' }
];

function PersonalityManager({ activeId, onSelect, onClose, onGenerateRequest }) {
    const [personalities, setPersonalities] = useState([]);
    const [isCreating, setIsCreating] = useState(false);
    const [newP, setNewP] = useState({ name: '', prompt: '' });
    const [idea, setIdea] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);

    useEffect(() => {
        const stored = localStorage.getItem('grove_personalities');
        if (stored) {
            setPersonalities(JSON.parse(stored));
        } else {
            setPersonalities(DEFAULT_PERSONALITIES);
            localStorage.setItem('grove_personalities', JSON.stringify(DEFAULT_PERSONALITIES));
        }
    }, []);

    const save = (list) => {
        setPersonalities(list);
        localStorage.setItem('grove_personalities', JSON.stringify(list));
    };

    const handleCreate = () => {
        if (!newP.name || !newP.prompt) return;
        const p = { id: Date.now().toString(), ...newP };
        save([...personalities, p]);
        setIsCreating(false);
        setNewP({ name: '', prompt: '' });
    };

    const handleDelete = (id) => {
        if (id === 'standard') return;
        save(personalities.filter(p => p.id !== id));
        if (activeId === id) onSelect('standard');
    };

    const handleGenerate = async () => {
        if (!idea) return;
        setIsGenerating(true);
        try {
            const prompt = await onGenerateRequest(idea);
            setNewP({ name: idea.charAt(0).toUpperCase() + idea.slice(1), prompt });
            setIsCreating(true);
        } catch (e) {
            console.error(e);
        } finally {
            setIsGenerating(false);
            setIdea('');
        }
    };

    return (
        <div className="library-overlay" onClick={onClose}>
            <div className="library-modal personalities-modal" onClick={e => e.stopPropagation()}>
                <div className="library-header">
                    <h2>AI Personalities</h2>
                    <button className="close-btn" onClick={onClose}>&times;</button>
                </div>

                <div className="p-manager-layout">
                    <div className="p-list">
                        {personalities.map(p => (
                            <div
                                key={p.id}
                                className={`p-item ${activeId === p.id ? 'active' : ''}`}
                                onClick={() => onSelect(p.id)}
                            >
                                <div className="p-info">
                                    <span className="p-name">{p.name}</span>
                                    {activeId === p.id && <span className="active-badge">Active</span>}
                                </div>
                                {p.id !== 'standard' && (
                                    <button className="p-delete" onClick={(e) => { e.stopPropagation(); handleDelete(p.id); }}>&times;</button>
                                )}
                            </div>
                        ))}
                        <button className="add-p-btn" onClick={() => setIsCreating(true)}>+ Create Manually</button>
                    </div>

                    <div className="p-editor">
                        {isCreating ? (
                            <div className="p-form">
                                <h3>Create Personality</h3>
                                <input
                                    placeholder="Name (e.g. Pirate)"
                                    value={newP.name}
                                    onChange={e => setNewP({ ...newP, name: e.target.value })}
                                />
                                <textarea
                                    placeholder="System Instructions..."
                                    value={newP.prompt}
                                    onChange={e => setNewP({ ...newP, prompt: e.target.value })}
                                    rows={8}
                                />
                                <div className="form-btns">
                                    <button className="cancel-btn" onClick={() => setIsCreating(false)}>Cancel</button>
                                    <button className="save-btn" onClick={handleCreate}>Save Personality</button>
                                </div>
                            </div>
                        ) : (
                            <div className="p-generator">
                                <h3>Generate with AI</h3>
                                <p>Tell us your idea, and we'll craft the perfect system instructions.</p>
                                <div className="gen-input-group">
                                    <textarea
                                        placeholder="e.g. A helpful assistant that speaks in riddles and is obsessed with tea..."
                                        value={idea}
                                        onChange={e => setIdea(e.target.value)}
                                        disabled={isGenerating}
                                    />
                                    <button
                                        className="gen-btn"
                                        onClick={handleGenerate}
                                        disabled={isGenerating || !idea}
                                    >
                                        {isGenerating ? 'Generating...' : 'Craft Instructions'}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default PersonalityManager;
