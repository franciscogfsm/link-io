// ============================================================
// LINK.IO Client - Leaderboard
// Live score rankings with kills, deaths, and streaks
// ============================================================

import type { Player } from '../../../shared/types';

interface LeaderboardProps {
  players: Player[];
  currentPlayerId: string;
}

function getStreakIcon(streak: number): string {
  if (streak >= 15) return '>>>>';
  if (streak >= 10) return '>>>';
  if (streak >= 7) return '>>';
  if (streak >= 5) return '>';
  if (streak >= 3) return '*';
  return '';
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
            {player.killStreak >= 3 && (
              <span style={{ marginLeft: 4 }}>{getStreakIcon(player.killStreak)}</span>
            )}
          </span>
          <span className="leaderboard-kills" style={{ fontSize: 10, opacity: 0.7, marginRight: 4 }}>
            {player.killCount}/{player.deaths}
          </span>
          <span className="leaderboard-energy">{Math.floor(player.score)}</span>
        </div>
      ))}
    </div>
  );
}
