// ============================================================
// LINK.IO Server - Entry Point
// Express + Socket.IO server
// ============================================================

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import type { ClientToServerEvents, ServerToClientEvents } from '../../shared/types.js';
import { RoomManager } from './rooms/RoomManager.js';

const PORT = parseInt(process.env.PORT || '3001', 10);
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

const app = express();
app.use(cors({ origin: CLIENT_URL }));
app.use(express.json());

const httpServer = createServer(app);

const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: {
    origin: CLIENT_URL,
    methods: ['GET', 'POST'],
  },
  pingInterval: 10000,
  pingTimeout: 5000,
});

const roomManager = new RoomManager(io);

io.on('connection', (socket) => {
  console.log(`[LINK.IO] Player connected: ${socket.id}`);
  roomManager.handleConnection(socket);

  socket.on('disconnect', () => {
    console.log(`[LINK.IO] Player disconnected: ${socket.id}`);
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    rooms: roomManager.getRoomCount(),
    players: roomManager.getPlayerCount(),
  });
});

httpServer.listen(PORT, () => {
  console.log(`\n╔══════════════════════════════════════╗`);
  console.log(`║        🔗 LINK.IO Server 🔗         ║`);
  console.log(`║  Running on http://localhost:${PORT}    ║`);
  console.log(`║  Client URL: ${CLIENT_URL.padEnd(22)}║`);
  console.log(`╚══════════════════════════════════════╝\n`);
});
