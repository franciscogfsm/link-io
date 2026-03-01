// ============================================================
// LINK.IO Client - Game Over Screen
// Winner announcement with full stats + XP gain
// ============================================================

import type { Player } from '../../../shared/types';

interface GameOverScreenProps {
  winner: Player | null;
  winningTeam?: number;
  scores: Player[];
  currentPlayerId: string;
  onPlayAgain: () => void;
  onMainMenu: () => void;
  xpGained?: number;
  coinsGained?: number;
}

export default function GameOverScreen({ winner, winningTeam, scores, currentPlayerId, onPlayAgain, onMainMenu, xpGained, coinsGained }: GameOverScreenProps) {
  const isWinner = winningTeam 
    ? scores.find(p => p.id === currentPlayerId)?.team === winningTeam
    : winner?.id === currentPlayerId;
    
  const titleClass = isWinner ? 'gameover-winner' : 'gameover-loser';
  const titleText = isWinner ? 'VICTORY' : 'DEFEATED';

  const teamNames = { 1: 'BLUE TEAM', 2: 'RED TEAM' };
  const me = scores.find(p => p.id === currentPlayerId);

  return (
    <div className="gameover-overlay">
      <div className="gameover-container">
        <h1 className={`gameover-title ${titleClass}`}>{titleText}</h1>

      {(winner || winningTeam) && (
        <p className="gameover-subtitle">
          {winningTeam 
            ? (isWinner ? `Your team claimed victory!` : `${teamNames[winningTeam as keyof typeof teamNames] || 'The enemy team'} won the arena`)
            : (isWinner ? 'Your network reigns supreme!' : `${winner?.name || 'Someone'} has dominated the arena`)}
        </p>
      )}

      {/* XP + Coins Display */}
      {((xpGained && xpGained > 0) || (coinsGained && coinsGained > 0)) && (
        <div className="gameover-xp">
          {xpGained && xpGained > 0 && <span className="xp-gain">+{xpGained} XP</span>}
          {coinsGained && coinsGained > 0 && <span className="coins-gain">+{coinsGained} COINS</span>}
          {isWinner && <span className="xp-bonus">WIN BONUS</span>}
          {me && me.bestStreak >= 5 && <span className="xp-bonus">STREAK BONUS</span>}
        </div>
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
              {player.team > 0 && <span className="gameover-score-metric team-metric">Team {player.team}</span>}
              <span className="gameover-score-metric">Kills: {player.killCount}</span>
              <span className="gameover-score-metric">Deaths: {player.deaths}</span>
              <span className="gameover-score-metric">Best Streak: {player.bestStreak}</span>
              <span className="gameover-score-metric">Nodes Stolen: {player.nodesStolen}</span>
              <span className="gameover-score-metric">Peak Nodes: {player.peakNodeCount}</span>
              <span className="gameover-score-metric">Max Chain: {player.longestChain}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="gameover-buttons">
        <button className="btn btn-primary gameover-play-again" onClick={onPlayAgain} id="play-again-button">
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
