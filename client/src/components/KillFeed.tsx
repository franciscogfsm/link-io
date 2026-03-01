// ============================================================
// LINK.IO Client - Kill Feed
// Real-time combat notifications with streak + revenge styling
// ============================================================

import type { KillFeedEntry } from '../../../shared/types';

interface KillFeedProps {
  entries: KillFeedEntry[];
}

function getEntryStyle(action: string): React.CSSProperties {
  if (action.includes('REVENGE')) {
    return { borderLeft: '3px solid #ff4444', background: 'rgba(255, 50, 50, 0.1)' };
  }
  if (action.includes('eliminated')) {
    return { borderLeft: '3px solid #ff006e', background: 'rgba(255, 0, 110, 0.08)' };
  }
  if (action.includes('STREAK') || action.includes('SPREE') || action.includes('RAMPAGE') || action.includes('GODLIKE')) {
    return { borderLeft: '3px solid #ffbe0b', background: 'rgba(255, 190, 11, 0.1)' };
  }
  return {};
}

function getActionColor(action: string): string {
  if (action.includes('REVENGE')) return '#ff4444';
  if (action.includes('eliminated')) return '#ff006e';
  if (action.includes('bounty')) return '#ffbe0b';
  return 'rgba(255,255,255,0.5)';
}

export default function KillFeed({ entries }: KillFeedProps) {
  if (entries.length === 0) return null;

  return (
    <div className="killfeed" id="killfeed">
      {entries.slice(-6).reverse().map((entry, i) => (
        <div
          key={entry.id}
          className="killfeed-entry"
          style={{
            opacity: 1 - i * 0.12,
            ...getEntryStyle(entry.action),
            paddingLeft: 8,
          }}
        >
          <span className="killfeed-player" style={{ color: entry.killerColor }}>
            {entry.killer}
          </span>
          <span className="killfeed-action" style={{ color: getActionColor(entry.action) }}>
            {entry.action}
          </span>
          <span className="killfeed-player" style={{ color: entry.victimColor }}>
            {entry.victim}
          </span>
        </div>
      ))}
    </div>
  );
}
