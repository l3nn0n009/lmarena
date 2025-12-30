import { io } from 'socket.io-client';

// For cloudflared tunnels, set VITE_BACKEND_URL to your backend tunnel URL
// Example: VITE_BACKEND_URL=https://your-backend-tunnel.trycloudflare.com
const SOCKET_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';

// Generate or retrieve persistent client ID
function getClientId() {
    let clientId = sessionStorage.getItem('grove_client_id');
    if (!clientId) {
        clientId = 'client_' + Math.random().toString(36).substring(2, 15);
        sessionStorage.setItem('grove_client_id', clientId);
    }
    return clientId;
}

class SocketService {
    constructor() {
        this.socket = null;
        this.listeners = new Map();
        this.clientId = getClientId();
    }

    connect() {
        if (this.socket?.connected) return this.socket;

        console.log('[Socket] Attempting to connect to:', SOCKET_URL);
        console.log('[Socket] Client ID:', this.clientId);

        this.socket = io(SOCKET_URL, {
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
            query: {
                clientId: this.clientId
            }
        });

        this.socket.on('connect', () => {
            console.log('[Socket] Connected to server, socket id:', this.socket.id);
            // Initialize with gemini-3-pro as default model
            this.emit('init', { model: 'gemini-3-pro' });
        });

        // Receive confirmed client ID from server
        this.socket.on('clientId', (data) => {
            console.log('[Socket] Confirmed client ID:', data.clientId);
            this.clientId = data.clientId;
            sessionStorage.setItem('grove_client_id', data.clientId);
        });

        this.socket.on('disconnect', (reason) => {
            console.log('[Socket] Disconnected from server, reason:', reason);
        });

        this.socket.on('connect_error', (error) => {
            console.error('[Socket] Connection error:', error.message);
            console.error('[Socket] Full error:', error);
        });

        // Log all incoming events for debugging
        this.socket.onAny((eventName, ...args) => {
            console.log(`[Socket] Event received: ${eventName}`, args);
        });

        // Specific error event handling
        this.socket.on('error', (data) => {
            console.error('[Socket] Server error:', data);
            console.error('[Socket] Error message:', data?.message || 'Unknown error');
        });

        this.socket.on('status', (data) => {
            console.log('[Socket] Status update:', data);
        });

        return this.socket;
    }

    getClientId() {
        return this.clientId;
    }

    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
    }

    emit(event, data) {
        console.log(`[Socket] Emitting event: ${event}`, data);
        if (this.socket) {
            this.socket.emit(event, data);
        }
    }

    on(event, callback) {
        if (this.socket) {
            this.socket.on(event, callback);
        }
    }

    off(event, callback) {
        if (this.socket) {
            this.socket.off(event, callback);
        }
    }

    // Convenience methods
    async sendMessage(message, conversationId, attachments = []) {
        this.emit('sendMessage', { message, conversationId, attachments });
    }

    async selectModel(model) {
        this.emit('selectModel', { model });
    }

    async loadChat(chatId) {
        this.emit('loadChat', { chatId });
    }

    executeToolCall(tool, args, conversationId) {
        this.emit('executeToolCall', { tool, args, conversationId });
    }
}

export const socketService = new SocketService();
export default socketService;
