// ============================================================
// LINK.IO Client - Leaderboard
// Live score rankings with kills and nodes
// ============================================================

import type { Player } from '../../../shared/types';

interface LeaderboardProps {
  players: Player[];
  currentPlayerId: string;
}

export default function Leaderboard({ players, currentPlayerId }: LeaderboardProps) {
  const sorted = [...players].sort((a, b) => {
    if (a.alive !== b.alive) return a.alive ? -1 : 1;
    return b.score - a.score;
  });

  return (
    <div className="hud-card leaderboard" id="leaderboard">
      <div className="leaderboard-title">Leaderboard</div>
      {sorted.map((player, i) => (
        <div
          key={player.id}
          className={`leaderboard-entry ${player.id === currentPlayerId ? 'self' : ''} ${!player.alive ? 'eliminated' : ''}`}
        >
          <span className="leaderboard-rank">#{i + 1}</span>
          <span
            className="leaderboard-color"
            style={{
              backgroundColor: player.color,
              boxShadow: `0 0 6px ${player.color}`,
            }}
          />
          <span className="leaderboard-name">
            {player.name}
            {player.killCount > 0 && (
              <span className="leaderboard-kills"> 💀{player.killCount}</span>
            )}
          </span>
          <span className="leaderboard-energy">{Math.floor(player.score)}</span>
        </div>
      ))}
    </div>
  );
}
