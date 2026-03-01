// ============================================================
// LINK.IO Client - Game Screen
// Main game: canvas, HUD, abilities, kill feed, combos
// ============================================================

import { useRef, useEffect, useState, useCallback } from 'react';
import type { Socket } from 'socket.io-client';
import type {
  GameState, ServerToClientEvents, ClientToServerEvents,
  Player, GameLink, KillFeedEntry, AbilityType, UpgradeType
} from '../../../shared/types';
import { GameRenderer } from '../game/GameRenderer';
import { setInvulnerablePlayers, setDeadPlayers } from '../game/GameRenderer';
import { Camera } from '../game/Camera';
import { InputHandler } from '../game/InputHandler';
import { Interpolation } from '../game/Interpolation';
import HUD from '../components/HUD';
import Leaderboard from '../components/Leaderboard';
import KillFeed from '../components/KillFeed';
import Tutorial from '../components/Tutorial';
import SettingsPanel from '../components/SettingsPanel';
import { getPlayerColor } from '../utils/colors';
import { audioManager } from '../game/AudioManager';

interface GameScreenProps {
  socket: Socket<ServerToClientEvents, ClientToServerEvents>;
  playerId: string;
  roomCode: string;
  onGameOver: (winner: Player | null, scores: Player[], winningTeam?: number, xpGained?: number) => void;
}

export default function GameScreen({ socket, playerId, roomCode, onGameOver }: GameScreenProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [isWaiting, setIsWaiting] = useState(true);
  const [showTutorial, setShowTutorial] = useState(() => !localStorage.getItem('linkio-tutorial-seen'));
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [killFeed, setKillFeed] = useState<KillFeedEntry[]>([]);
  const [comboDisplay, setComboDisplay] = useState<{ combo: number; bonus: number } | null>(null);
  const [respawnTimer, setRespawnTimer] = useState(0);
  const [isDead, setIsDead] = useState(false);
  const [killStreakAnnouncement, setKillStreakAnnouncement] = useState<{ label: string; streak: number } | null>(null);
  const [mapEventAnnouncement, setMapEventAnnouncement] = useState<{ name: string; type: string } | null>(null);
  const [deathInfo, setDeathInfo] = useState<{ killerName: string; isRevenge: boolean } | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [warpMode, setWarpMode] = useState(false);
  const rendererRef = useRef<GameRenderer | null>(null);
  const cameraRef = useRef<Camera | null>(null);
  const inputRef = useRef<InputHandler | null>(null);
  const interpRef = useRef<Interpolation | null>(null);
  const stateRef = useRef<GameState | null>(null);
  const animRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const warpModeRef = useRef(false);

  const handleCreateLink = useCallback((fromNodeId: string, toNodeId: string) => {
    socket.emit('game:createLink', { fromNodeId, toNodeId });
  }, [socket]);

  const handleUseAbility = useCallback((ability: AbilityType) => {
    socket.emit('game:useAbility', { ability });
  }, [socket]);

  const handleToggleWarp = useCallback(() => {
    const newMode = !warpModeRef.current;
    warpModeRef.current = newMode;
    setWarpMode(newMode);
    if (newMode) {
      // Set input handler to warp mode
      inputRef.current?.setWarpMode(true, (nodeId: string) => {
        socket.emit('game:useAbility', { ability: 'warp' as AbilityType, targetNodeId: nodeId });
        warpModeRef.current = false;
        setWarpMode(false);
        inputRef.current?.setWarpMode(false, null);
      });
    } else {
      inputRef.current?.setWarpMode(false, null);
    }
  }, [socket]);

  const handleUpgrade = useCallback((upgrade: UpgradeType) => {
    socket.emit('game:upgrade', { upgrade });
  }, [socket]);

  const handleClickNode = useCallback((nodeId: string) => {
    socket.emit('game:clickNode', { nodeId });
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
    input.setOnClickNode(handleClickNode);

    // === WASD movement tracking ===
    const keysHeld = { w: false, a: false, s: false, d: false };
    let lastDirX = 0;
    let lastDirY = 0;

    const emitMovement = () => {
      let dx = 0;
      let dy = 0;
      if (keysHeld.a) dx -= 1;
      if (keysHeld.d) dx += 1;
      if (keysHeld.w) dy -= 1;
      if (keysHeld.s) dy += 1;
      // Only emit when direction actually changes
      if (dx !== lastDirX || dy !== lastDirY) {
        lastDirX = dx;
        lastDirY = dy;
        socket.emit('game:move', { direction: { x: dx, y: dy } });
      }
    };

    // Keyboard shortcuts for abilities (W remapped to R since WASD is movement)
    const onKeyDown = (e: KeyboardEvent) => {
      // WASD movement
      if (e.key === 'w' || e.key === 'W') { keysHeld.w = true; emitMovement(); return; }
      if (e.key === 'a' || e.key === 'A') { keysHeld.a = true; emitMovement(); return; }
      if (e.key === 's' || e.key === 'S') { keysHeld.s = true; emitMovement(); return; }
      if (e.key === 'd' || e.key === 'D') { keysHeld.d = true; emitMovement(); return; }

      if (e.key === 'q' || e.key === 'Q') handleUseAbility('surge');
      if (e.key === 'r' || e.key === 'R') handleUseAbility('shield');
      if (e.key === 'e' || e.key === 'E') handleUseAbility('emp');
      if (e.key === ' ') { e.preventDefault(); handleToggleWarp(); }
      if (e.key === 'Escape') { if (warpModeRef.current) { warpModeRef.current = false; setWarpMode(false); inputRef.current?.setWarpMode(false, null); } else { setShowSettings((p) => !p); } }

      // Emotes
      if (e.key === '1') socket.emit('game:emote', { emote: '(^o^)' });
      if (e.key === '2') socket.emit('game:emote', { emote: '(x_x)' });
      if (e.key === '3') socket.emit('game:emote', { emote: '(>_<)' });
      if (e.key === '4') socket.emit('game:emote', { emote: '(O_O)' });
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'w' || e.key === 'W') { keysHeld.w = false; emitMovement(); }
      if (e.key === 'a' || e.key === 'A') { keysHeld.a = false; emitMovement(); }
      if (e.key === 's' || e.key === 'S') { keysHeld.s = false; emitMovement(); }
      if (e.key === 'd' || e.key === 'D') { keysHeld.d = false; emitMovement(); }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    // Socket events
    socket.on('game:state', (state: GameState) => {
      stateRef.current = state;
      setGameState(state);
      interp.pushState(state);
      input.setNodes(state.nodes);
      input.setLinks(state.links.map((l) => ({ fromNodeId: l.fromNodeId, toNodeId: l.toNodeId })));
      if (state.gamePhase === 'playing') setIsWaiting(false);
      if (state.killFeed) setKillFeed(state.killFeed);
    });

    socket.on('game:started', (state: GameState) => {
      stateRef.current = state;
      setGameState(state);
      interp.pushState(state);
      input.setNodes(state.nodes);
      input.setLinks(state.links.map((l) => ({ fromNodeId: l.fromNodeId, toNodeId: l.toNodeId })));
      setIsWaiting(false);
      audioManager.init();
      audioManager.playGameStart();
      audioManager.startMusic();
    });

    socket.on('game:ended', (data) => {
      audioManager.playGameEnd();
      audioManager.stopMusic();
      onGameOver(data.winner, data.scores, data.winningTeam, data.xpGained);
    });

    socket.on('game:linkCreated', (link: GameLink) => {
      audioManager.playLinkCreate();
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
      audioManager.playLinkDestroy();
      const state = stateRef.current;
      if (state) {
        for (const nodeId of data.nodeIds) {
          const node = state.nodes.find((n) => n.id === nodeId);
          if (node) {
            const player = state.players.find((p) => p.id === data.playerId);
            const color = player ? getPlayerColor(player.color).main : '#ff006e';
            renderer.particles.spawnCollapseExplosion(node.position.x, node.position.y, color);
          }
        }
      }
    });

    socket.on('game:killFeed', (entry: KillFeedEntry) => {
      setKillFeed((prev) => [...prev.slice(-7), entry]);
    });

    socket.on('game:screenShake', (data) => {
      renderer.triggerScreenShake(data.intensity, data.duration);
      audioManager.playImpact(data.intensity);
    });

    socket.on('game:combo', (data) => {
      if (data.playerId === playerId) {
        setComboDisplay({ combo: data.combo, bonus: data.bonusEnergy });
        setTimeout(() => setComboDisplay(null), 1500);
        audioManager.playCombo(data.combo);
      }
      // Floating text for combo
      const state = stateRef.current;
      if (state) {
        const player = state.players.find((p) => p.id === data.playerId);
        if (player) {
          const coreNode = state.nodes.find((n) => n.id === player.coreNodeId);
          if (coreNode) {
            renderer.addFloatingText(
              `COMBO x${data.combo}! +${data.bonusEnergy}`,
              coreNode.position.x,
              coreNode.position.y - 40,
              player.color,
              data.combo >= 5 ? 24 : data.combo >= 3 ? 20 : 16
            );
          }
        }
      }
    });

    socket.on('game:abilityUsed', (data) => {
      if (data.playerId === playerId) {
        if (data.ability !== 'warp') audioManager.playAbility(data.ability);
      }
      const state = stateRef.current;
      if (state) {
        const player = state.players.find((p) => p.id === data.playerId);
        if (player) {
          const coreNode = state.nodes.find((n) => n.id === player.coreNodeId);
          if (coreNode) {
            const labels: Record<AbilityType, string> = {
              surge: '[PULSE]',
              shield: '[GUARD]',
              emp: '[BLAST]',
              warp: '[WARP]',
            };
            renderer.addFloatingText(
              labels[data.ability],
              coreNode.position.x,
              coreNode.position.y - 60,
              player.color,
              22
            );
            // Spawn particles at affected nodes
            for (const nodeId of data.targetNodes) {
              const node = state.nodes.find((n) => n.id === nodeId);
              if (node) {
                if (data.ability === 'emp') {
                  renderer.particles.spawnCollapseExplosion(node.position.x, node.position.y, '#ff00ff');
                } else if (data.ability === 'surge') {
                  renderer.particles.spawnLinkSparkle(node.position.x, node.position.y, '#ffbe0b');
                }
              }
            }
          }
        }
      }
    });

    socket.on('game:emote', (data) => {
      renderer.addEmote(data.emote, data.position);
    });

    socket.on('game:error', (data) => {
      setErrorMsg(data.message);
      audioManager.playError();
      setTimeout(() => setErrorMsg(null), 2000);
    });

    // === NEW: Elimination, respawn, and kill streak events ===

    socket.on('game:playerEliminated', (data) => {
      const state = stateRef.current;
      if (!state) return;

      // Spawn death explosion at victim position
      const victimPlayer = state.players.find((p) => p.id === data.victimId);
      const victimColor = victimPlayer ? getPlayerColor(victimPlayer.color).main : '#ff006e';
      renderer.particles.spawnDeathExplosion(data.victimPosition.x, data.victimPosition.y, victimColor);
      renderer.triggerScreenShake(data.victimId === playerId ? 12 : 5, 0.4);

      if (data.victimId === playerId) {
        setIsDead(true);
        audioManager.playSelfDeath();
        // Find killer name
        const killer = state.players.find((p) => p.id === data.killerId);
        setDeathInfo({
          killerName: killer?.name || 'Unknown',
          isRevenge: data.isRevenge,
        });
      } else {
        audioManager.playElimination();
      }

      // Floating text for the kill
      if (data.killerId) {
        const killer = state.players.find((p) => p.id === data.killerId);
        if (killer) {
          renderer.addFloatingText(
            data.isRevenge ? '💀 REVENGE!' : '💀 ELIMINATED!',
            data.victimPosition.x,
            data.victimPosition.y - 30,
            data.isRevenge ? '#ff4444' : killer.color,
            data.isRevenge ? 28 : 22
          );
        }
      }
    });

    socket.on('game:playerRespawned', (data) => {
      if (data.playerId === playerId) {
        setIsDead(false);
        setDeathInfo(null);
        setRespawnTimer(0);
        audioManager.playRespawn();
      }
      // Spawn respawn particles
      const state = stateRef.current;
      if (state) {
        const player = state.players.find((p) => p.id === data.playerId);
        const color = player ? getPlayerColor(player.color).main : '#00f0ff';
        renderer.particles.spawnRespawnEffect(data.position.x, data.position.y, color);
        if (data.playerId === playerId) {
          renderer.addFloatingText('RESPAWNED!', data.position.x, data.position.y - 40, '#00f0ff', 24);
        }
      }
    });

    socket.on('game:killStreak', (data) => {
      if (data.playerId === playerId) {
        setKillStreakAnnouncement({ label: data.label, streak: data.streak });
        setTimeout(() => setKillStreakAnnouncement(null), 3000);
        audioManager.playKillStreak(data.streak);
      }
      // Floating text for streak
      const state = stateRef.current;
      if (state) {
        const player = state.players.find((p) => p.id === data.playerId);
        if (player) {
          const coreNode = state.nodes.find((n) => n.id === player.coreNodeId);
          if (coreNode) {
            renderer.addFloatingText(
              `${data.label}! (${data.streak})`,
              coreNode.position.x,
              coreNode.position.y - 60,
              '#ffbe0b',
              data.streak >= 10 ? 32 : data.streak >= 7 ? 28 : 24
            );
          }
        }
      }
    });

    socket.on('game:mapEvent', (event) => {
      let name = '';
      if (event.type === 'energy_storm') name = 'ENERGY STORM';
      if (event.type === 'power_surge') name = 'POWER SURGE';
      if (event.type === 'overcharge') name = 'OVERCHARGE ZONE';

      
      setMapEventAnnouncement({ name, type: event.type });
      setTimeout(() => setMapEventAnnouncement(null), 4000);
      
      renderer.triggerScreenShake(3, 0.5);
      audioManager.playMapEvent();
    });

    socket.on('game:playerDamaged', (data) => {
      if (data.playerId === playerId) {
        // Shake on taking damage
        renderer.triggerScreenShake(3 + (1 - data.health / data.maxHealth) * 6, 0.15);
        audioManager.playDamage();
      }
      // Floating damage number at victim's core
      const state = stateRef.current;
      if (state) {
        const victim = state.players.find((p) => p.id === data.playerId);
        if (victim) {
          const coreNode = state.nodes.find((n) => n.id === victim.coreNodeId);
          if (coreNode) {
            renderer.addFloatingText(
              `-${Math.ceil(data.damage)}`,
              coreNode.position.x + (Math.random() - 0.5) * 30,
              coreNode.position.y - 30,
              '#ff006e',
              14
            );
          }
        }
      }
    });

    // Click rewards — floating text for click-spam energy
    socket.on('game:clickReward', (data) => {
      if (data.playerId !== playerId) return;
      const state = stateRef.current;
      if (!state) return;
      const node = state.nodes.find((n) => n.id === data.nodeId);
      if (node) {
        const color = data.streak >= 10 ? '#ffbe0b' : data.streak >= 5 ? '#39ff14' : '#00f0ff';
        const size = Math.min(12 + data.streak, 24);
        renderer.addFloatingText(
          data.message,
          node.position.x + (Math.random() - 0.5) * 40,
          node.position.y - 20 - Math.random() * 20,
          color,
          size
        );
        // Tiny screen pop for satisfying feedback
        if (data.streak >= 5) {
          renderer.triggerScreenShake(1 + data.streak * 0.2, 0.05);
        }
      }
    });

    // Game loop
    const gameLoop = (time: number) => {
      const dt = lastTimeRef.current ? (time - lastTimeRef.current) / 1000 : 0.016;
      lastTimeRef.current = time;

      const state = stateRef.current;
      if (state) {
        // Sync invulnerability & dead sets for renderer
        const invulnSet = new Set<string>();
        const deadSet = new Set<string>();
        for (const p of state.players) {
          if (p.invulnTimer > 0) invulnSet.add(p.id);
          if (!p.alive) deadSet.add(p.id);
        }
        setInvulnerablePlayers(invulnSet);
        setDeadPlayers(deadSet);

        // Update respawn timer for local player
        const localPlayer = state.players.find((p) => p.id === playerId);
        if (localPlayer && localPlayer.respawnTimer > 0) {
          setRespawnTimer(localPlayer.respawnTimer);
        }

        const interpolatedNodes = interp.interpolateNodes(state.nodes);
        const interpolatedState = { ...state, nodes: interpolatedNodes };

        if (localPlayer) {
          const coreNode = interpolatedNodes.find((n) => n.id === localPlayer.coreNodeId);
          if (coreNode) camera.followTarget(coreNode.position.x, coreNode.position.y);
        }

        camera.update(dt);
        renderer.render(
          interpolatedState, playerId, input.dragState,
          input.hoveredNodeId, input.validTargets, dt
        );
      }

      animRef.current = requestAnimationFrame(gameLoop);
    };

    animRef.current = requestAnimationFrame(gameLoop);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      // Stop movement on cleanup
      socket.emit('game:move', { direction: { x: 0, y: 0 } });
      socket.off('game:state');
      socket.off('game:started');
      socket.off('game:ended');
      socket.off('game:linkCreated');
      socket.off('game:networkCollapsed');
      socket.off('game:killFeed');
      socket.off('game:screenShake');
      socket.off('game:combo');
      socket.off('game:abilityUsed');
      socket.off('game:emote');
      socket.off('game:error');
      socket.off('game:playerEliminated');
      socket.off('game:playerRespawned');
      socket.off('game:killStreak');
      socket.off('game:playerDamaged');
      socket.off('game:clickReward');
    };
  }, [socket, playerId, handleCreateLink, handleClickNode, handleUseAbility, onGameOver]);

  const currentPlayer = gameState?.players.find((p) => p.id === playerId);

  return (
    <div className="game-container">
      <canvas ref={canvasRef} className="game-canvas" id="game-canvas" />

      {/* Free-look indicator */}
      {cameraRef.current?.freeLook && (
        <div className="freelook-indicator">
          [ FREE LOOK ] — press SPACE to snap back
        </div>
      )}

      {gameState && (
        <div className="hud-overlay">
          <HUD
            player={currentPlayer}
            state={gameState}
            roomCode={roomCode}
            onUseAbility={handleUseAbility}
            onUpgrade={handleUpgrade}
            isDead={isDead}
            respawnTimer={respawnTimer}
            warpMode={warpMode}
            onToggleWarp={handleToggleWarp}
          />
          <div className="hud-right">
            <Leaderboard 
              players={gameState.players} 
              currentPlayerId={playerId} 
              gameMode={gameState.gameMode}
              teamScores={gameState.teamScores}
            />
            <KillFeed entries={killFeed} />
          </div>
        </div>
      )}

      {/* Death overlay */}
      {isDead && (
        <div className="death-overlay">
          <div className="death-title">ELIMINATED</div>
          {deathInfo && (
            <div className="death-killer">
              {deathInfo.isRevenge ? 'Revenge by ' : 'Killed by '}
              <span className="death-killer-name">{deathInfo.killerName}</span>
            </div>
          )}
          <div className="death-respawn-timer">
            Respawning in <span className="death-timer-value">{Math.ceil(respawnTimer)}</span>s
          </div>
          <div className="death-hint">Spectating...</div>
        </div>
      )}

      {/* Kill streak announcement */}
      {killStreakAnnouncement && (
        <div className="streak-announcement">
          <div className="streak-label">{killStreakAnnouncement.label}</div>
          <div className="streak-count">{killStreakAnnouncement.streak} kills</div>
        </div>
      )}

      {/* Combo popup */}
      {comboDisplay && (
        <div className="combo-popup">
          <div className="combo-number">COMBO x{comboDisplay.combo}</div>
          <div className="combo-bonus">+{comboDisplay.bonus}</div>
        </div>
      )}

      {/* Map Event Announcement */}
      {mapEventAnnouncement && (
        <div className="event-announcement">
          <div className="event-title">WARNING: {mapEventAnnouncement.name}</div>
        </div>
      )}

      {errorMsg && (
        <div className="game-error-toast">{errorMsg}</div>
      )}

      {isWaiting && (
        <div className="waiting-overlay">
          <div className="waiting-text">Waiting for players...</div>
          <div
            className="waiting-code"
            onClick={() => {
              navigator.clipboard.writeText(roomCode).catch(() => {});
            }}
            title="Click to copy"
            style={{ cursor: 'pointer' }}
          >
            {roomCode}
          </div>
          <div className="waiting-hint">Click the code to copy it. Share with friends!</div>
        </div>
      )}

      {showTutorial && !isWaiting && (
        <Tutorial onComplete={handleTutorialComplete} />
      )}

      {/* Controls hint */}
      {!showTutorial && !isWaiting && !isDead && (
        <div className="emote-hint">
          [1-4] Emotes | [Q] Pulse [E] Blast [SPACE] Warp | [WASD] Move | Click & drag to link
        </div>
      )}

      {/* Settings gear button */}
      <button
        className="settings-gear-btn"
        onClick={() => setShowSettings(true)}
        title="Settings"
      >
        ⚙
      </button>

      {/* Settings Panel */}
      <SettingsPanel isOpen={showSettings} onClose={() => setShowSettings(false)} />
    </div>
  );
}
