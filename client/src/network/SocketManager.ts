// ============================================================
// LINK.IO Client - Socket Manager
// Type-safe Socket.IO wrapper with reconnection
// ============================================================

import { io, Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '../../../shared/types';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

class SocketManager {
  private socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;

  connect(): Socket<ServerToClientEvents, ClientToServerEvents> {
    if (this.socket?.connected) return this.socket;

    this.socket = io(SERVER_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      timeout: 10000,
    }) as Socket<ServerToClientEvents, ClientToServerEvents>;

    this.socket.on('connect', () => {
      console.log('[LINK.IO] Connected to server:', this.socket?.id);
    });

    this.socket.on('disconnect', (reason) => {
      console.log('[LINK.IO] Disconnected:', reason);
    });

    this.socket.on('connect_error', (error) => {
      console.warn('[LINK.IO] Connection error:', error.message);
    });

    return this.socket;
  }

  getSocket(): Socket<ServerToClientEvents, ClientToServerEvents> | null {
    return this.socket;
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
}

export const socketManager = new SocketManager();
