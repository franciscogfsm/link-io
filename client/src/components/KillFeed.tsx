// ============================================================
// LINK.IO Client - Kill Feed
// Real-time combat notifications
// ============================================================

import type { KillFeedEntry } from '../../../shared/types';

interface KillFeedProps {
  entries: KillFeedEntry[];
}

export default function KillFeed({ entries }: KillFeedProps) {
  if (entries.length === 0) return null;

  return (
    <div className="killfeed" id="killfeed">
      {entries.slice(-5).reverse().map((entry, i) => (
        <div key={entry.id} className="killfeed-entry" style={{ opacity: 1 - i * 0.15 }}>
          <span className="killfeed-player" style={{ color: entry.killerColor }}>
            {entry.killer}
          </span>
          <span className="killfeed-action">{entry.action}</span>
          <span className="killfeed-player" style={{ color: entry.victimColor }}>
            {entry.victim}
          </span>
        </div>
      ))}
    </div>
  );
}
