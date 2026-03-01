// ============================================================
// LINK.IO Client - Leaderboard
// Live score rankings with kills, deaths, and streaks
// ============================================================

import type { Player, GameMode } from '../../../shared/types';

interface LeaderboardProps {
  players: Player[];
  currentPlayerId: string;
  gameMode?: GameMode;
  teamScores?: number[];
}

function getStreakIcon(streak: number): string {
  if (streak >= 15) return '>>>>';
  if (streak >= 10) return '>>>';
  if (streak >= 7) return '>>';
  if (streak >= 5) return '>';
  if (streak >= 3) return '*';
  return '';
}

export default function Leaderboard({ players, currentPlayerId, gameMode, teamScores }: LeaderboardProps) {
  const sorted = [...players].sort((a, b) => {
    if (a.alive !== b.alive) return a.alive ? -1 : 1;
    return b.score - a.score;
  });

  const isTeams = gameMode === 'teams';
  const t1Score = teamScores?.[1] || 0;
  const t2Score = teamScores?.[2] || 0;

  return (
    <div className="hud-card leaderboard" id="leaderboard">
      <div className="leaderboard-title">
        {isTeams ? 'Team Race' : 'Leaderboard'}
      </div>
      
      {isTeams && (
        <div className="team-scores-header" style={{ marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 'bold', color: '#00f0ff' }}>BLUE</span>
            <span style={{ fontFamily: 'var(--font-display)', color: '#00f0ff' }}>{t1Score}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 'bold', color: '#ff006e' }}>RED</span>
            <span style={{ fontFamily: 'var(--font-display)', color: '#ff006e' }}>{t2Score}</span>
          </div>
          <div style={{ height: 1, background: 'rgba(255,255,255,0.1)', margin: '4px 0' }} />
        </div>
      )}
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
              borderRadius: isTeams ? '2px' : '50%',
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
