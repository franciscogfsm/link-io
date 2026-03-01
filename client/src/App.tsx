// ============================================================
// LINK.IO Client - App Root
// Screen routing: Menu → Game → GameOver
// ============================================================

import { useState, useCallback, useRef } from 'react';
import type { Socket } from 'socket.io-client';
import type { ServerToClientEvents, ClientToServerEvents, Player } from '../../shared/types';
import { socketManager } from './network/SocketManager';
import MenuScreen from './screens/MenuScreen';
import GameScreen from './screens/GameScreen';
import GameOverScreen from './screens/GameOverScreen';

type Screen = 'menu' | 'game' | 'gameover';

export default function App() {
  const [screen, setScreen] = useState<Screen>('menu');
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [playerId, setPlayerId] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [winner, setWinner] = useState<Player | null>(null);
  const [scores, setScores] = useState<Player[]>([]);
  const socketRef = useRef<Socket<ServerToClientEvents, ClientToServerEvents> | null>(null);
  const lastNameRef = useRef('');

  const connectAndJoin = useCallback((name: string, action: 'play' | 'create' | 'join', code?: string) => {
    setError(null);
    setConnecting(true);
    lastNameRef.current = name;

    const socket = socketManager.connect();
    socketRef.current = socket;

    // Wait for connection
    const onConnect = () => {
      socket.off('connect', onConnect);

      // Set up room events
      socket.once('room:joined', (data) => {
        setPlayerId(data.playerId);
        setRoomCode(data.roomCode);
        setConnecting(false);
        setScreen('game');
      });

      socket.once('room:error', (data) => {
        setError(data.message);
        setConnecting(false);
      });

      // Emit join event
      if (action === 'create') {
        socket.emit('player:createRoom', { name });
      } else if (action === 'join' && code) {
        socket.emit('player:join', { name, roomCode: code });
      } else {
        socket.emit('player:join', { name });
      }
    };

    if (socket.connected) {
      onConnect();
    } else {
      socket.on('connect', onConnect);

      // Timeout
      setTimeout(() => {
        if (!socket.connected) {
          setError('Could not connect to server. Make sure the server is running.');
          setConnecting(false);
        }
      }, 5000);
    }
  }, []);

  const handlePlay = useCallback((name: string) => {
    connectAndJoin(name, 'play');
  }, [connectAndJoin]);

  const handleCreateLobby = useCallback((name: string) => {
    connectAndJoin(name, 'create');
  }, [connectAndJoin]);

  const handleJoinLobby = useCallback((name: string, code: string) => {
    connectAndJoin(name, 'join', code);
  }, [connectAndJoin]);

  const handleGameOver = useCallback((w: Player | null, s: Player[]) => {
    setWinner(w);
    setScores(s);
    setScreen('gameover');
  }, []);

  const handlePlayAgain = useCallback(() => {
    // Disconnect and reconnect for a fresh game
    socketManager.disconnect();
    setScreen('menu');
    setError(null);
    setTimeout(() => {
      connectAndJoin(lastNameRef.current, 'play');
    }, 300);
  }, [connectAndJoin]);

  const handleMainMenu = useCallback(() => {
    socketManager.disconnect();
    setScreen('menu');
    setError(null);
  }, []);

  return (
    <>
      {screen === 'menu' && (
        <MenuScreen
          onPlay={handlePlay}
          onCreateLobby={handleCreateLobby}
          onJoinLobby={handleJoinLobby}
          error={error}
          connecting={connecting}
        />
      )}

      {screen === 'game' && socketRef.current && (
        <GameScreen
          socket={socketRef.current}
          playerId={playerId}
          roomCode={roomCode}
          onGameOver={handleGameOver}
        />
      )}

      {screen === 'gameover' && (
        <GameOverScreen
          winner={winner}
          scores={scores}
          currentPlayerId={playerId}
          onPlayAgain={handlePlayAgain}
          onMainMenu={handleMainMenu}
        />
      )}
    </>
  );
}
