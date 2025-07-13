import { io, Socket } from 'socket.io-client';

class SocketService {
  private socket: Socket | null = null;
  private sessionId: string | null = null;
  private clientId: string | null = null;

  connect(sessionId: string, clientId: string): Socket {
    if (this.socket?.connected) {
      return this.socket;
    }

    this.sessionId = sessionId;
    this.clientId = clientId;

    this.socket = io('http://localhost:3000', {
      auth: {
        role: 'player',
        sessionId,
        clientId
      },
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    this.setupEventListeners();
    return this.socket;
  }

  private setupEventListeners() {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log('Connected to game server');
    });

    this.socket.on('disconnect', () => {
      console.log('Disconnected from game server');
    });

    this.socket.on('error', (error) => {
      console.error('Socket error:', error);
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  getSocket(): Socket | null {
    return this.socket;
  }

  emit(event: string, data: any) {
    if (this.socket?.connected) {
      this.socket.emit(event, data);
    }
  }
}

export default new SocketService();
