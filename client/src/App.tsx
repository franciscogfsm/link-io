// ============================================================
// LINK.IO Client - App Root
// Screen routing: Menu → Game → GameOver
// XP persistence, lobby management, queue status
// ============================================================

import { useState, useCallback, useRef, useEffect } from 'react';
import type { Socket } from 'socket.io-client';
import type { ServerToClientEvents, ClientToServerEvents, Player, GameMode, LobbyInfo, PlayerProgression } from '../../shared/types';
import { getLevelFromXP, xpToNextLevel, xpForLevel, LEVEL_TITLES, ALL_COSMETICS } from '../../shared/types';
import { socketManager } from './network/SocketManager';
import MenuScreen from './screens/MenuScreen';
import GameScreen from './screens/GameScreen';
import GameOverScreen from './screens/GameOverScreen';

type Screen = 'menu' | 'game' | 'gameover';

// XP / Progression helpers (uses scaling from shared types)

function loadProgression(): PlayerProgression {
  try {
    const data = localStorage.getItem('linkio-progression');
    if (data) {
      const parsed = JSON.parse(data);
      // Migrate old format
      if (!parsed.equippedSkin) parsed.equippedSkin = 'skin_default';
      if (!parsed.equippedPet) parsed.equippedPet = 'pet_none';
      if (!parsed.equippedTrail) parsed.equippedTrail = 'trail_none';
      if (!parsed.equippedBorder) parsed.equippedBorder = 'border_none';
      if (!parsed.equippedDeathEffect) parsed.equippedDeathEffect = 'death_default';
      if (!parsed.unlockedCosmetics) parsed.unlockedCosmetics = ['skin_default', 'pet_none', 'trail_none', 'border_none', 'death_default'];
      // Ensure death_default is unlocked
      if (!parsed.unlockedCosmetics.includes('death_default')) parsed.unlockedCosmetics.push('death_default');
      if (typeof parsed.coins !== 'number') parsed.coins = 0;
      if (typeof parsed.totalCoinsEarned !== 'number') parsed.totalCoinsEarned = 0;
      if (typeof parsed.boxesOpened !== 'number') parsed.boxesOpened = 0;
      if (typeof parsed.pityCounter !== 'number') parsed.pityCounter = 0;
      if (typeof parsed.dailyStreak !== 'number') parsed.dailyStreak = 0;
      if (!parsed.lastDailyClaimDate) parsed.lastDailyClaimDate = '';
      if (typeof parsed.totalDailysClaimed !== 'number') parsed.totalDailysClaimed = 0;
      return parsed;
    }
  } catch { /* ignore */ }
  return {
    xp: 0, level: 1, gamesPlayed: 0, totalKills: 0,
    totalWins: 0, bestStreak: 0, longestGame: 0,
    titles: ['Newcomer'], currentTitle: 'Newcomer',
    equippedSkin: 'skin_default',
    equippedPet: 'pet_none',
    equippedTrail: 'trail_none',
    equippedBorder: 'border_none',
    equippedDeathEffect: 'death_default',
    unlockedCosmetics: ['skin_default', 'pet_none', 'trail_none', 'border_none', 'death_default'],
    coins: 0,
    totalCoinsEarned: 0,
    boxesOpened: 0,
    pityCounter: 0,
    dailyStreak: 0,
    lastDailyClaimDate: '',
    totalDailysClaimed: 0,
  };
}

function saveProgression(prog: PlayerProgression): void {
  localStorage.setItem('linkio-progression', JSON.stringify(prog));
}

function addXP(xp: number, kills: number, won: boolean, bestStreak: number, coinsEarned: number = 0): PlayerProgression {
  const prog = loadProgression();
  prog.xp += xp;
  prog.coins += coinsEarned;
  prog.totalCoinsEarned += coinsEarned;
  prog.gamesPlayed++;
  prog.totalKills += kills;
  if (won) prog.totalWins++;
  if (bestStreak > prog.bestStreak) prog.bestStreak = bestStreak;
  prog.level = getLevelFromXP(prog.xp);

  // Unlock titles
  let currentTitle = 'Newcomer';
  for (const [threshold, title] of LEVEL_TITLES) {
    if (prog.level >= threshold) {
      currentTitle = title;
      if (!prog.titles.includes(title)) prog.titles.push(title);
    }
  }
  prog.currentTitle = currentTitle;

  // Auto-unlock level-based cosmetics
  for (const item of ALL_COSMETICS) {
    if (item.source !== 'box' && prog.level >= item.levelRequired && !prog.unlockedCosmetics.includes(item.id)) {
      prog.unlockedCosmetics.push(item.id);
    }
  }

  saveProgression(prog);
  return prog;
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('menu');
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [playerId, setPlayerId] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [winner, setWinner] = useState<Player | null>(null);
  const [winningTeam, setWinningTeam] = useState<number | undefined>(undefined);
  const [scores, setScores] = useState<Player[]>([]);
  const [xpGained, setXpGained] = useState(0);
  const [coinsGained, setCoinsGained] = useState(0);
  const [lobbyInfo, setLobbyInfo] = useState<LobbyInfo | null>(null);
  const [queueStatus, setQueueStatus] = useState<{ position: number; playersNeeded: number; message: string } | null>(null);
  const socketRef = useRef<Socket<ServerToClientEvents, ClientToServerEvents> | null>(null);
  const lastNameRef = useRef('');
  const lastModeRef = useRef<GameMode>('ffa');

  const connectAndJoin = useCallback((name: string, action: 'play' | 'create' | 'join', code?: string, gameMode: GameMode = 'ffa') => {
    setError(null);
    setConnecting(true);
    setLobbyInfo(null);
    setQueueStatus(null);
    lastNameRef.current = name;
    lastModeRef.current = gameMode;

    const socket = socketManager.connect();
    socketRef.current = socket;

    // Set up lobby/queue listeners
    socket.off('lobby:update');
    socket.off('lobby:countdown');
    socket.off('queue:status');

    socket.on('lobby:update', (data: LobbyInfo) => {
      setLobbyInfo(data);
      setConnecting(false);
    });

    socket.on('lobby:countdown', (data) => {
      // Could show countdown UI
    });

    socket.on('queue:status', (data) => {
      setQueueStatus(data);
      setConnecting(false);
    });

    // Wait for connection
    const onConnect = () => {
      socket.off('connect', onConnect);

      // Set up room events
      socket.once('room:joined', (data) => {
        setPlayerId(data.playerId);
        setRoomCode(data.roomCode);
        setConnecting(false);

        // If this is a lobby (create or join with code), don't go to game yet
        // Stay on menu so they see the lobby UI; game:started will trigger transition
        if (action === 'create' || action === 'join') {
          return;
        }

        // For 2v2 queue, game:started will trigger transition
        if (action === 'play' && gameMode === 'teams') {
          // Wait for game to start
          return;
        }

        setScreen('game');
      });

      socket.once('room:error', (data) => {
        setError(data.message);
        setConnecting(false);
      });

      // Listen for game started (for lobbies and queues)
      socket.on('game:started', () => {
        setLobbyInfo(null);
        setQueueStatus(null);
        setScreen('game');
      });

      // Emit join event — include equipped pet for server-side bonuses
      const progData = JSON.parse(localStorage.getItem('linkio-progression') || '{}');
      const equippedPet = progData.equippedPet || 'pet_none';
      if (action === 'create') {
        socket.emit('player:createRoom', { name, gameMode, equippedPet });
      } else if (action === 'join' && code) {
        socket.emit('player:join', { name, roomCode: code, equippedPet });
      } else {
        socket.emit('player:join', { name, gameMode, equippedPet });
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

  const handlePlay = useCallback((name: string, gameMode: GameMode) => {
    connectAndJoin(name, 'play', undefined, gameMode);
  }, [connectAndJoin]);

  const handleCreateLobby = useCallback((name: string, gameMode: GameMode) => {
    connectAndJoin(name, 'create', undefined, gameMode);
  }, [connectAndJoin]);

  const handleJoinLobby = useCallback((name: string, code: string) => {
    connectAndJoin(name, 'join', code);
  }, [connectAndJoin]);

  const handleLobbySetTeam = useCallback((team: number) => {
    socketRef.current?.emit('lobby:setTeam', { team });
  }, []);

  const handleLobbyToggleReady = useCallback(() => {
    socketRef.current?.emit('lobby:toggleReady');
  }, []);

  const handleLobbyStartGame = useCallback(() => {
    socketRef.current?.emit('lobby:startGame');
  }, []);

  const handleGameOver = useCallback((w: Player | null, s: Player[], team?: number, xp?: number, coins?: number) => {
    setWinner(w);
    setScores(s);
    setWinningTeam(team);

    // Save XP + coins
    const gained = xp || 50;
    const earnedCoins = coins || 10;
    setXpGained(gained);
    setCoinsGained(earnedCoins);
    const me = s.find(p => p.id === playerId);
    const isWinner = w?.id === playerId || (team !== undefined && me?.team === team);
    addXP(gained, me?.killCount || 0, isWinner, me?.bestStreak || 0, earnedCoins);

    setScreen('gameover');
  }, [playerId]);

  const handlePlayAgain = useCallback(() => {
    // Disconnect and reconnect for a fresh game
    socketManager.disconnect();
    setScreen('menu');
    setError(null);
    setLobbyInfo(null);
    setQueueStatus(null);
    setTimeout(() => {
      connectAndJoin(lastNameRef.current, 'play', undefined, lastModeRef.current);
    }, 300);
  }, [connectAndJoin]);

  const handleMainMenu = useCallback(() => {
    socketManager.disconnect();
    setScreen('menu');
    setError(null);
    setLobbyInfo(null);
    setQueueStatus(null);
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
          roomCode={roomCode}
          playerId={playerId}
          lobbyInfo={lobbyInfo}
          queueStatus={queueStatus}
          onLobbySetTeam={handleLobbySetTeam}
          onLobbyToggleReady={handleLobbyToggleReady}
          onLobbyStartGame={handleLobbyStartGame}
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
          winningTeam={winningTeam}
          scores={scores}
          currentPlayerId={playerId}
          onPlayAgain={handlePlayAgain}
          onMainMenu={handleMainMenu}
          xpGained={xpGained}
          coinsGained={coinsGained}
        />
      )}
    </>
  );
}
