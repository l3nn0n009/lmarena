import { useState, useEffect, useCallback } from 'react';
import socketService from '../services/socket';

export function useSocket() {
    const [isConnected, setIsConnected] = useState(false);
    const [isReady, setIsReady] = useState(false);
    const [status, setStatus] = useState({ type: 'info', message: 'Connecting...' });
    const [currentModel, setCurrentModel] = useState(null);
    const [modelIcon, setModelIcon] = useState(null);

    useEffect(() => {
        const socket = socketService.connect();

        socket.on('connect', () => {
            setIsConnected(true);
            setStatus({ type: 'info', message: 'Connected, initializing browser...' });
        });

        socket.on('disconnect', () => {
            setIsConnected(false);
            setIsReady(false);
            setStatus({ type: 'error', message: 'Disconnected from server' });
        });

        socket.on('status', (data) => {
            setStatus(data);
        });

        socket.on('ready', (data) => {
            if (data.initialized) {
                setIsReady(true);
                setStatus({ type: 'success', message: 'Ready to chat!' });
            }
        });

        socket.on('modelSelected', (data) => {
            if (data.success) {
                setCurrentModel(data.model);
                // Store the extracted icon if present
                if (data.iconUrl) {
                    setModelIcon(data.iconUrl);
                }
            }
        });

        socket.on('error', (data) => {
            setStatus({ type: 'error', message: data.message });
        });

        return () => {
            socketService.disconnect();
        };
    }, []);

    const sendMessage = useCallback((message, conversationId, attachments = []) => {
        socketService.sendMessage(message, conversationId, attachments);
    }, []);

    const selectModel = useCallback((model) => {
        socketService.selectModel(model);
    }, []);

    const loadChat = useCallback((chatId) => {
        socketService.loadChat(chatId);
    }, []);

    return {
        isConnected,
        isReady,
        status,
        currentModel,
        modelIcon,
        sendMessage,
        selectModel,
        loadChat,
        socket: socketService.socket
    };
}

export default useSocket;
