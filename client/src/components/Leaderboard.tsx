// ============================================================
// LINK.IO Client - Leaderboard Component
// Live player rankings by energy
// ============================================================

import type { Player } from '../../../shared/types';

interface LeaderboardProps {
  players: Player[];
  currentPlayerId: string;
}

export default function Leaderboard({ players, currentPlayerId }: LeaderboardProps) {
  const sorted = [...players].sort((a, b) => {
    if (a.alive !== b.alive) return a.alive ? -1 : 1;
    return b.energy - a.energy;
  });

  return (
    <div className="hud-card leaderboard">
      <div className="leaderboard-title">Leaderboard</div>
      {sorted.map((player, i) => {
        const isSelf = player.id === currentPlayerId;
        const cls = `leaderboard-entry${isSelf ? ' self' : ''}${!player.alive ? ' eliminated' : ''}`;
        return (
          <div key={player.id} className={cls}>
            <span className="leaderboard-rank">#{i + 1}</span>
            <span
              className="leaderboard-color"
              style={{
                backgroundColor: player.color,
                boxShadow: `0 0 6px ${player.color}`,
              }}
            />
            <span className="leaderboard-name">{player.name}</span>
            <span className="leaderboard-energy">{Math.floor(player.energy)}</span>
          </div>
        );
      })}
    </div>
  );
}
