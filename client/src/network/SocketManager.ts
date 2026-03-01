// ============================================================
// LINK.IO Client - Socket Manager
// Type-safe Socket.IO wrapper with reconnection
// ============================================================

import { io, Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '../../../shared/types';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

class SocketManager {
  private socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;
  private playerCountListeners: Array<(data: { players: number; rooms: number }) => void> = [];

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
      // Request initial player count
      this.socket?.emit('player:requestPlayerCount');
    });

    this.socket.on('disconnect', (reason) => {
      console.log('[LINK.IO] Disconnected:', reason);
    });

    this.socket.on('connect_error', (error) => {
      console.warn('[LINK.IO] Connection error:', error.message);
    });

    // Forward player count updates
    this.socket.on('server:playerCount', (data) => {
      for (const listener of this.playerCountListeners) {
        listener(data);
      }
    });

    return this.socket;
  }

  getSocket(): Socket<ServerToClientEvents, ClientToServerEvents> | null {
    return this.socket;
  }

  onPlayerCount(listener: (data: { players: number; rooms: number }) => void): () => void {
    this.playerCountListeners.push(listener);
    return () => {
      this.playerCountListeners = this.playerCountListeners.filter(l => l !== listener);
    };
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
}

export const socketManager = new SocketManager();
