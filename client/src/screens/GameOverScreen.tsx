// ============================================================
// LINK.IO Client - Game Over Screen
// Winner announcement with full stats
// ============================================================

import type { Player } from '../../../shared/types';

interface GameOverScreenProps {
  winner: Player | null;
  scores: Player[];
  currentPlayerId: string;
  onPlayAgain: () => void;
  onMainMenu: () => void;
}

export default function GameOverScreen({ winner, scores, currentPlayerId, onPlayAgain, onMainMenu }: GameOverScreenProps) {
  const isWinner = winner?.id === currentPlayerId;
  const titleClass = isWinner ? 'gameover-winner' : 'gameover-loser';
  const titleText = isWinner ? 'VICTORY' : 'DEFEATED';

  return (
    <div className="gameover-overlay">
      <div className="gameover-container">
        <h1 className={`gameover-title ${titleClass}`}>{titleText}</h1>

      {winner && (
        <p className="gameover-subtitle">
          {isWinner ? 'Your network reigns supreme!' : `${winner.name} has dominated the arena`}
        </p>
      )}

      <div className="gameover-scores">
        {scores.map((player, i) => (
          <div key={player.id} className={`gameover-score-entry ${player.id === currentPlayerId ? 'self' : ''}`}>
            <span className="gameover-score-rank">#{i + 1}</span>
            <span
              className="gameover-score-color"
              style={{
                backgroundColor: player.color,
                boxShadow: `0 0 8px ${player.color}`,
              }}
            />
            <span className="gameover-score-name">
              {player.name}
              {player.id === currentPlayerId ? ' (You)' : ''}
            </span>
            <div className="gameover-score-stats">
              <span className="gameover-score-metric">Score: {Math.floor(player.score)}</span>
              <span className="gameover-score-metric">Kills: {player.killCount}</span>
              <span className="gameover-score-metric">Nodes: {player.nodeCount}</span>
              <span className="gameover-score-metric">Energy: {Math.floor(player.energy)}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="gameover-buttons">
        <button className="btn btn-primary" onClick={onPlayAgain} id="play-again-button">
          PLAY AGAIN
        </button>
        <button className="btn btn-secondary" onClick={onMainMenu} id="main-menu-button">
          MAIN MENU
        </button>
      </div>
      </div>
    </div>
  );
}
