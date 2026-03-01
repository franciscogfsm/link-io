// ============================================================
// LINK.IO Client - Game Screen
// Main game view with canvas, HUD, tutorial, and Socket.IO
// ============================================================

import { useRef, useEffect, useState, useCallback } from 'react';
import type { Socket } from 'socket.io-client';
import type { GameState, ServerToClientEvents, ClientToServerEvents, Player, GameLink } from '../../../shared/types';
import { GameRenderer } from '../game/GameRenderer';
import { Camera } from '../game/Camera';
import { InputHandler } from '../game/InputHandler';
import { Interpolation } from '../game/Interpolation';
import HUD from '../components/HUD';
import Leaderboard from '../components/Leaderboard';
import Tutorial from '../components/Tutorial';
import { getPlayerColor } from '../utils/colors';

interface GameScreenProps {
  socket: Socket<ServerToClientEvents, ClientToServerEvents>;
  playerId: string;
  roomCode: string;
  onGameOver: (winner: Player | null, scores: Player[]) => void;
}

export default function GameScreen({ socket, playerId, roomCode, onGameOver }: GameScreenProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [isWaiting, setIsWaiting] = useState(true);
  const [showTutorial, setShowTutorial] = useState(() => {
    // Show tutorial only on first visit
    const seen = localStorage.getItem('linkio-tutorial-seen');
    return !seen;
  });
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const rendererRef = useRef<GameRenderer | null>(null);
  const cameraRef = useRef<Camera | null>(null);
  const inputRef = useRef<InputHandler | null>(null);
  const interpRef = useRef<Interpolation | null>(null);
  const stateRef = useRef<GameState | null>(null);
  const animRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);

  const handleCreateLink = useCallback((fromNodeId: string, toNodeId: string) => {
    console.log('[LINK.IO] Emitting createLink:', fromNodeId, '->', toNodeId);
    socket.emit('game:createLink', { fromNodeId, toNodeId });
  }, [socket]);

  const handleTutorialComplete = useCallback(() => {
    setShowTutorial(false);
    localStorage.setItem('linkio-tutorial-seen', 'true');
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const camera = new Camera(canvas);
    const renderer = new GameRenderer(canvas, camera);
    const input = new InputHandler(canvas, camera);
    const interp = new Interpolation();

    cameraRef.current = camera;
    rendererRef.current = renderer;
    inputRef.current = input;
    interpRef.current = interp;

    input.setPlayerId(playerId);
    input.setOnCreateLink(handleCreateLink);

    // Socket event handlers
    socket.on('game:state', (state: GameState) => {
      stateRef.current = state;
      setGameState(state);
      interp.pushState(state);
      input.setNodes(state.nodes);
      input.setLinks(state.links.map(l => ({ fromNodeId: l.fromNodeId, toNodeId: l.toNodeId })));

      if (state.gamePhase === 'playing') {
        setIsWaiting(false);
      }
    });

    socket.on('game:started', (state: GameState) => {
      stateRef.current = state;
      setGameState(state);
      interp.pushState(state);
      input.setNodes(state.nodes);
      input.setLinks(state.links.map(l => ({ fromNodeId: l.fromNodeId, toNodeId: l.toNodeId })));
      setIsWaiting(false);
    });

    socket.on('game:ended', (data) => {
      onGameOver(data.winner, data.scores);
    });

    socket.on('game:linkCreated', (link: GameLink) => {
      console.log('[LINK.IO] Link created!', link);
      const state = stateRef.current;
      if (state) {
        const fromNode = state.nodes.find((n) => n.id === link.fromNodeId);
        const toNode = state.nodes.find((n) => n.id === link.toNodeId);
        if (fromNode && toNode) {
          const player = state.players.find((p) => p.id === link.owner);
          const color = player ? getPlayerColor(player.color).main : '#ffffff';
          renderer.particles.spawnLinkSparkle(
            (fromNode.position.x + toNode.position.x) / 2,
            (fromNode.position.y + toNode.position.y) / 2,
            color
          );
        }
      }
    });

    socket.on('game:networkCollapsed', (data) => {
      const state = stateRef.current;
      if (state) {
        for (const nodeId of data.nodeIds) {
          const node = state.nodes.find((n) => n.id === nodeId);
          if (node) {
            const player = state.players.find((p) => p.id === data.playerId);
            const color = player ? getPlayerColor(player.color).main : '#ff006e';
            renderer.particles.spawnCollapseExplosion(
              node.position.x,
              node.position.y,
              color
            );
          }
        }
      }
    });

    socket.on('game:error', (data) => {
      console.warn('[LINK.IO] Game error:', data.message);
      setErrorMsg(data.message);
      setTimeout(() => setErrorMsg(null), 2000);
    });

    // Game render loop
    const gameLoop = (time: number) => {
      const dt = lastTimeRef.current ? (time - lastTimeRef.current) / 1000 : 0.016;
      lastTimeRef.current = time;

      const state = stateRef.current;
      if (state) {
        // Interpolate node positions
        const interpolatedNodes = interp.interpolateNodes(state.nodes);
        const interpolatedState = { ...state, nodes: interpolatedNodes };

        // Follow player's core node
        const player = state.players.find((p) => p.id === playerId);
        if (player) {
          const coreNode = interpolatedNodes.find((n) => n.id === player.coreNodeId);
          if (coreNode) {
            camera.followTarget(coreNode.position.x, coreNode.position.y);
          }
        }

        camera.update();
        renderer.render(
          interpolatedState,
          playerId,
          input.dragState,
          input.hoveredNodeId,
          input.validTargets,
          dt
        );
      }

      animRef.current = requestAnimationFrame(gameLoop);
    };

    animRef.current = requestAnimationFrame(gameLoop);

    return () => {
      cancelAnimationFrame(animRef.current);
      socket.off('game:state');
      socket.off('game:started');
      socket.off('game:ended');
      socket.off('game:linkCreated');
      socket.off('game:networkCollapsed');
      socket.off('game:error');
    };
  }, [socket, playerId, handleCreateLink, onGameOver]);

  const currentPlayer = gameState?.players.find((p) => p.id === playerId);

  return (
    <div className="game-container">
      <canvas ref={canvasRef} className="game-canvas" id="game-canvas" />

      {gameState && (
        <div className="hud-overlay">
          <HUD player={currentPlayer} state={gameState} roomCode={roomCode} />
          <div className="hud-right">
            <Leaderboard players={gameState.players} currentPlayerId={playerId} />
          </div>
        </div>
      )}

      {/* Error toast */}
      {errorMsg && (
        <div className="game-error-toast">
          {errorMsg}
        </div>
      )}

      {isWaiting && (
        <div className="waiting-overlay">
          <div className="waiting-text">Waiting for players...</div>
          <div className="waiting-code">{roomCode}</div>
          <div className="waiting-hint">Share this code with friends to join!</div>
        </div>
      )}

      {showTutorial && !isWaiting && (
        <Tutorial onComplete={handleTutorialComplete} />
      )}
    </div>
  );
}
