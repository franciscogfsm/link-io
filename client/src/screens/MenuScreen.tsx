// ============================================================
// LINK.IO Client - Menu Screen
// Premium landing page, clipboard copy, player count, XP
// Loot box system, daily rewards, cosmetics shop
// ============================================================

import { useState, useRef, useEffect, useCallback, type ReactElement } from 'react';
import { socketManager } from '../network/SocketManager';
import type { GameMode, LobbyInfo, PlayerProgression, CosmeticItem, CosmeticType, CosmeticRarity, LootBoxTier } from '../../../shared/types';
import {
  getLevelFromXP, xpToNextLevel, xpForLevel, LEVEL_TITLES,
  ALL_COSMETICS, RARITY_COLORS, RARITY_LABELS,
  LOOT_BOXES, DAILY_REWARDS, PITY_THRESHOLD, LEGENDARY_PITY,
  getPetBonusLabels, PET_BONUSES, REDEEM_CODES,
} from '../../../shared/types';

// ======== Progression helpers ========
function getProgression(): PlayerProgression {
  try {
    const data = localStorage.getItem('linkio-progression');
    if (data) {
      const parsed = JSON.parse(data);
      if (!parsed.equippedSkin) parsed.equippedSkin = 'skin_default';
      if (!parsed.equippedPet) parsed.equippedPet = 'pet_none';
      if (!parsed.equippedTrail) parsed.equippedTrail = 'trail_none';
      if (!parsed.equippedBorder) parsed.equippedBorder = 'border_none';
      if (!parsed.equippedDeathEffect) parsed.equippedDeathEffect = 'death_default';
      if (!parsed.unlockedCosmetics) parsed.unlockedCosmetics = ['skin_default', 'pet_none', 'trail_none', 'border_none', 'death_default'];
      if (!parsed.unlockedCosmetics.includes('death_default')) parsed.unlockedCosmetics.push('death_default');
      if (typeof parsed.coins !== 'number') parsed.coins = 0;
      if (typeof parsed.totalCoinsEarned !== 'number') parsed.totalCoinsEarned = 0;
      if (typeof parsed.boxesOpened !== 'number') parsed.boxesOpened = 0;
      if (typeof parsed.pityCounter !== 'number') parsed.pityCounter = 0;
      if (typeof parsed.dailyStreak !== 'number') parsed.dailyStreak = 0;
      if (!parsed.lastDailyClaimDate) parsed.lastDailyClaimDate = '';
      if (typeof parsed.totalDailysClaimed !== 'number') parsed.totalDailysClaimed = 0;
      parsed.level = getLevelFromXP(parsed.xp);
      // Auto-unlock level-based cosmetics
      for (const item of ALL_COSMETICS) {
        if (item.source !== 'box' && parsed.level >= item.levelRequired && !parsed.unlockedCosmetics.includes(item.id)) {
          parsed.unlockedCosmetics.push(item.id);
        }
      }
      return parsed;
    }
  } catch { /* ignore */ }
  return {
    xp: 0, level: 1, gamesPlayed: 0, totalKills: 0,
    totalWins: 0, bestStreak: 0, longestGame: 0,
    titles: ['Newcomer'], currentTitle: 'Newcomer',
    equippedSkin: 'skin_default', equippedPet: 'pet_none',
    equippedTrail: 'trail_none', equippedBorder: 'border_none',
    equippedDeathEffect: 'death_default',
    unlockedCosmetics: ['skin_default', 'pet_none', 'trail_none', 'border_none', 'death_default'],
    coins: 0, totalCoinsEarned: 0, boxesOpened: 0,
    pityCounter: 0, dailyStreak: 0, lastDailyClaimDate: '', totalDailysClaimed: 0,
  };
}

function saveProgression(prog: PlayerProgression): void {
  localStorage.setItem('linkio-progression', JSON.stringify(prog));
}

// ======== Loot box rolling logic ========
function rollRarity(box: LootBoxTier, pity: number): CosmeticRarity {
  // Pity overrides
  if (pity >= LEGENDARY_PITY) return 'legendary';
  if (pity >= PITY_THRESHOLD) return 'epic';
  const r = Math.random();
  let cumulative = 0;
  const rarities: CosmeticRarity[] = ['mythic', 'legendary', 'epic', 'rare', 'uncommon', 'common'];
  for (const rarity of rarities) {
    cumulative += box.rates[rarity];
    if (r < cumulative) return rarity;
  }
  return 'common';
}

function getItemsOfRarity(rarity: CosmeticRarity, unlockedIds: string[]): CosmeticItem[] {
  return ALL_COSMETICS.filter(c =>
    c.rarity === rarity && c.source !== 'level' && !unlockedIds.includes(c.id)
  );
}

function pickRandomItem(box: LootBoxTier, prog: PlayerProgression): { item: CosmeticItem; rarity: CosmeticRarity; isDuplicate: boolean } {
  const rarity = rollRarity(box, prog.pityCounter);
  let pool = getItemsOfRarity(rarity, prog.unlockedCosmetics);

  // If no unowned items at this rarity, try adjacent rarities, then allow duplicates
  if (pool.length === 0) {
    const fallbackOrder: CosmeticRarity[] = ['mythic', 'legendary', 'epic', 'rare', 'uncommon', 'common'];
    for (const fb of fallbackOrder) {
      pool = getItemsOfRarity(fb, prog.unlockedCosmetics);
      if (pool.length > 0) break;
    }
  }

  if (pool.length === 0) {
    // All items owned — give duplicate for coin refund
    const allOfRarity = ALL_COSMETICS.filter(c => c.rarity === rarity && c.source !== 'level');
    const item = allOfRarity.length > 0
      ? allOfRarity[Math.floor(Math.random() * allOfRarity.length)]
      : ALL_COSMETICS[Math.floor(Math.random() * ALL_COSMETICS.length)];
    return { item, rarity, isDuplicate: true };
  }

  return { item: pool[Math.floor(Math.random() * pool.length)], rarity, isDuplicate: false };
}

// Duplicate coin refund amounts
const DUPE_REFUND: Record<CosmeticRarity, number> = {
  common: 15, uncommon: 25, rare: 50, epic: 100, legendary: 200, mythic: 400,
};

// Today's date as YYYY-MM-DD
function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

function canClaimDaily(prog: PlayerProgression): boolean {
  return prog.lastDailyClaimDate !== todayStr();
}

function getDailyRewardIndex(prog: PlayerProgression): number {
  return prog.dailyStreak % DAILY_REWARDS.length;
}

// ======== Tab type icons (SVG inline) ========
const TAB_ICONS: Record<CosmeticType, ReactElement> = {
  skin: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>,
  pet: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-7 8-7s8 3 8 7"/><circle cx="4" cy="5" r="2"/><circle cx="20" cy="5" r="2"/></svg>,
  trail: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2l3 7h7l-5.5 4 2 7L12 16l-6.5 4 2-7L2 9h7z"/></svg>,
  border: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="3"/><rect x="7" y="7" width="10" height="10" rx="2"/></svg>,
  deathEffect: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>,
};

const TAB_LABELS: Record<CosmeticType, string> = {
  skin: 'Skins',
  pet: 'Pets',
  trail: 'Trails',
  border: 'Borders',
  deathEffect: 'Effects',
};

interface MenuScreenProps {
  onPlay: (name: string, gameMode: GameMode) => void;
  onCreateLobby: (name: string, gameMode: GameMode) => void;
  onJoinLobby: (name: string, code: string) => void;
  error: string | null;
  connecting: boolean;
  roomCode?: string;
  playerId?: string;
  lobbyInfo?: LobbyInfo | null;
  queueStatus?: { position: number; playersNeeded: number; message: string } | null;
  onLobbySetTeam?: (team: number) => void;
  onLobbyToggleReady?: () => void;
  onLobbyStartGame?: () => void;
}

// ======== View states for the shop overlay ========
type ShopView = 'main' | 'collection' | 'crates' | 'daily' | 'redeem';

export default function MenuScreen({ onPlay, onCreateLobby, onJoinLobby, error, connecting, roomCode, playerId, lobbyInfo, queueStatus, onLobbySetTeam, onLobbyToggleReady, onLobbyStartGame }: MenuScreenProps) {
  const [name, setName] = useState(() => localStorage.getItem('linkio-name') || '');
  const [joinCode, setJoinCode] = useState('');
  const [gameMode, setGameMode] = useState<GameMode>('ffa');
  const [copied, setCopied] = useState(false);
  const [onlinePlayers, setOnlinePlayers] = useState(0);
  const [showShop, setShowShop] = useState(false);
  const [shopView, setShopView] = useState<ShopView>('main');
  const [shopTab, setShopTab] = useState<CosmeticType>('skin');
  const [prog, setProg] = useState(getProgression);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Loot box state
  const [openingBox, setOpeningBox] = useState<LootBoxTier | null>(null);
  const [boxResult, setBoxResult] = useState<{ item: CosmeticItem; rarity: CosmeticRarity; isDuplicate: boolean } | null>(null);
  const [boxAnimPhase, setBoxAnimPhase] = useState<'idle' | 'spinning' | 'reveal'>('idle');
  const [reelItems, setReelItems] = useState<{ item: CosmeticItem; rarity: CosmeticRarity }[]>([]);

  // Redeem code state
  const [codeInput, setCodeInput] = useState('');
  const [codeResult, setCodeResult] = useState<{ ok: boolean; msg: string } | null>(null);

  // Daily reward state
  const [dailyClaimed, setDailyClaimed] = useState(!canClaimDaily(prog));

  const xpNeeded = xpToNextLevel(prog.level);
  const xpIntoLevel = prog.xp - xpForLevel(prog.level);
  const xpPercent = Math.min((xpIntoLevel / xpNeeded) * 100, 100);

  // ======== Equip cosmetic ========
  const equipCosmetic = useCallback((item: CosmeticItem) => {
    const updated = { ...prog };
    if (item.type === 'skin') updated.equippedSkin = item.id;
    else if (item.type === 'pet') updated.equippedPet = item.id;
    else if (item.type === 'trail') updated.equippedTrail = item.id;
    else if (item.type === 'border') updated.equippedBorder = item.id;
    else if (item.type === 'deathEffect') updated.equippedDeathEffect = item.id;
    saveProgression(updated);
    setProg(updated);
  }, [prog]);

  const getShopItems = () => ALL_COSMETICS.filter(c => c.type === shopTab);

  // ======== Redeem code ========
  const redeemCode = useCallback(() => {
    const code = codeInput.trim().toUpperCase();
    if (!code) return;
    const used: string[] = JSON.parse(localStorage.getItem('linkio-codes') || '[]');
    if (used.includes(code)) {
      setCodeResult({ ok: false, msg: 'Code already redeemed.' });
      return;
    }
    const reward = REDEEM_CODES[code];
    if (!reward) {
      setCodeResult({ ok: false, msg: 'Invalid code.' });
      return;
    }
    const updated = { ...prog, coins: prog.coins + reward.coins, totalCoinsEarned: prog.totalCoinsEarned + reward.coins };
    saveProgression(updated);
    setProg(updated);
    used.push(code);
    localStorage.setItem('linkio-codes', JSON.stringify(used));
    setCodeResult({ ok: true, msg: `+${reward.coins.toLocaleString()} coins added!` });
    setCodeInput('');
  }, [codeInput, prog]);
  const isUnlocked = (id: string) => prog.unlockedCosmetics.includes(id);
  const isEquipped = (item: CosmeticItem) => {
    if (item.type === 'skin') return prog.equippedSkin === item.id;
    if (item.type === 'pet') return prog.equippedPet === item.id;
    if (item.type === 'trail') return prog.equippedTrail === item.id;
    if (item.type === 'border') return prog.equippedBorder === item.id;
    if (item.type === 'deathEffect') return prog.equippedDeathEffect === item.id;
    return false;
  };

  // ======== Open a loot box ========
  const openBox = useCallback((box: LootBoxTier) => {
    if (prog.coins < box.cost) return;
    const updated = { ...prog, coins: prog.coins - box.cost, boxesOpened: prog.boxesOpened + 1 };
    const result = pickRandomItem(box, updated);

    if (!result.isDuplicate) {
      updated.unlockedCosmetics = [...updated.unlockedCosmetics, result.item.id];
      // Reset pity if epic+
      if (['epic', 'legendary', 'mythic'].includes(result.rarity)) {
        updated.pityCounter = 0;
      } else {
        updated.pityCounter++;
      }
    } else {
      // Duplicate refund
      updated.coins += DUPE_REFUND[result.rarity];
      updated.pityCounter++;
    }

    saveProgression(updated);
    setProg(updated);

    // Build reel items for spin animation (22 fake + 1 real at end — longer spin!)
    const fakeReel: { item: CosmeticItem; rarity: CosmeticRarity }[] = [];
    const rarities: CosmeticRarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];
    for (let i = 0; i < 22; i++) {
      // Weighted random for visual effect (show near-misses)
      let fakeRarity: CosmeticRarity;
      const r = Math.random();
      if (r < 0.30) fakeRarity = 'common';
      else if (r < 0.55) fakeRarity = 'uncommon';
      else if (r < 0.75) fakeRarity = 'rare';
      else if (r < 0.88) fakeRarity = 'epic';
      else if (r < 0.96) fakeRarity = 'legendary';
      else fakeRarity = 'mythic';
      const fakePool = ALL_COSMETICS.filter(c => c.rarity === fakeRarity && c.source !== 'level');
      const fakeItem = fakePool.length > 0 ? fakePool[Math.floor(Math.random() * fakePool.length)] : ALL_COSMETICS[0];
      fakeReel.push({ item: fakeItem, rarity: fakeRarity });
    }
    // Near-miss psychology: put TWO near-misses right before the result
    const resultIdx = rarities.indexOf(result.rarity);
    if (resultIdx < rarities.length - 1) {
      const nearMissRarity = rarities[resultIdx + 1];
      const nearPool = ALL_COSMETICS.filter(c => c.rarity === nearMissRarity && c.source !== 'level');
      if (nearPool.length > 0) {
        fakeReel[19] = { item: nearPool[Math.floor(Math.random() * nearPool.length)], rarity: nearMissRarity };
        fakeReel[21] = { item: nearPool[Math.floor(Math.random() * nearPool.length)], rarity: nearMissRarity };
      }
    }
    fakeReel.push({ item: result.item, rarity: result.rarity });
    setReelItems(fakeReel);

    setOpeningBox(box);
    setBoxResult(result);
    setBoxAnimPhase('spinning');

    // Longer spin with dramatic slowdown: 3.5s spin, then reveal
    setTimeout(() => {
      setBoxAnimPhase('reveal');
    }, 3500);
  }, [prog]);

  const closeBoxReveal = useCallback(() => {
    setOpeningBox(null);
    setBoxResult(null);
    setBoxAnimPhase('idle');
    setReelItems([]);
  }, []);

  // ======== Claim daily reward ========
  const claimDaily = useCallback(() => {
    if (!canClaimDaily(prog)) return;
    const updated = { ...prog };
    const today = todayStr();

    // Check streak continuity
    if (updated.lastDailyClaimDate) {
      const lastDate = new Date(updated.lastDailyClaimDate);
      const todayDate = new Date(today);
      const diffDays = Math.floor((todayDate.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays > 1) {
        updated.dailyStreak = 0; // Streak broken
      }
    }

    const rewardIdx = updated.dailyStreak % DAILY_REWARDS.length;
    const reward = DAILY_REWARDS[rewardIdx];
    updated.coins += reward.coins;
    updated.totalCoinsEarned += reward.coins;
    updated.dailyStreak++;
    updated.lastDailyClaimDate = today;
    updated.totalDailysClaimed++;

    // Day 4 and 7 bonus crates auto-granted (give random items from box)
    if (reward.day === 4) {
      const stdBox = LOOT_BOXES[0];
      const r = pickRandomItem(stdBox, updated);
      if (!r.isDuplicate) {
        updated.unlockedCosmetics = [...updated.unlockedCosmetics, r.item.id];
      } else {
        updated.coins += DUPE_REFUND[r.rarity];
      }
    } else if (reward.day === 7) {
      const premBox = LOOT_BOXES[1];
      const r = pickRandomItem(premBox, updated);
      if (!r.isDuplicate) {
        updated.unlockedCosmetics = [...updated.unlockedCosmetics, r.item.id];
      } else {
        updated.coins += DUPE_REFUND[r.rarity];
      }
    }

    saveProgression(updated);
    setProg(updated);
    setDailyClaimed(true);
  }, [prog]);

  // ======== Side effects ========
  useEffect(() => {
    if (name.trim()) localStorage.setItem('linkio-name', name.trim());
  }, [name]);

  useEffect(() => {
    const socket = socketManager.connect();
    socket.emit('player:requestPlayerCount');
    const unsub = socketManager.onPlayerCount((data) => {
      setOnlinePlayers(data.players);
    });
    return () => { unsub(); };
  }, []);

  // Animated background
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    let animId: number;

    interface BgParticle {
      x: number; y: number; vx: number; vy: number;
      size: number; alpha: number; hue: number;
    }

    const particles: BgParticle[] = [];
    for (let i = 0; i < 100; i++) {
      particles.push({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        size: 1 + Math.random() * 2,
        alpha: 0.05 + Math.random() * 0.35,
        hue: 180 + Math.random() * 40,
      });
    }

    const draw = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      ctx.fillStyle = '#05050f';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.strokeStyle = 'rgba(0, 240, 255, 0.03)';
      ctx.lineWidth = 1;
      const gridSize = 60;
      for (let x = 0; x < canvas.width; x += gridSize) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
      }
      for (let y = 0; y < canvas.height; y += gridSize) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
      }

      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[j].x - particles[i].x;
          const dy = particles[j].y - particles[i].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 120) {
            ctx.strokeStyle = `rgba(0, 240, 255, ${0.08 * (1 - dist / 120)})`;
            ctx.lineWidth = 0.6;
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }
      }

      for (const p of particles) {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;
        ctx.fillStyle = `hsla(${p.hue}, 80%, 60%, ${p.alpha})`;
        ctx.shadowColor = `hsla(${p.hue}, 80%, 60%, 0.4)`;
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
      animId = requestAnimationFrame(draw);
    };

    animId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animId);
  }, []);

  const playerName = name.trim() || 'Player';

  const handleCopyCode = async () => {
    if (!roomCode) return;
    try {
      await navigator.clipboard.writeText(roomCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const el = document.createElement('textarea');
      el.value = roomCode;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // ======== Rarity-colored dot for cards ========
  const rarityDot = (rarity: CosmeticRarity) => (
    <span className="rarity-dot" style={{ background: RARITY_COLORS[rarity] }} />
  );

  // ======== RENDER ========
  return (
    <div className="menu-container">
      <canvas ref={canvasRef} className="menu-bg-canvas" />
      <div className="menu-content">
        <h1 className="menu-title">
          LINK<span className="dot">.</span>IO
        </h1>
        <p className="menu-subtitle">BUILD · CONNECT · DOMINATE</p>

        {/* Player Hub — XP + Coins + Shop */}
        <div className="player-hub">
          <div className="hub-top-row">
            <div className="hub-level-badge">LVL {prog.level}</div>
            <span className="hub-title">{prog.currentTitle}</span>
            {onlinePlayers > 0 && (
              <div className="hub-online">
                <span className="online-dot" />
                <span>{onlinePlayers} online</span>
              </div>
            )}
          </div>
          <div className="hub-xp-row">
            <div className="hub-xp-bar">
              <div className="hub-xp-fill" style={{ width: `${xpPercent}%` }} />
            </div>
            <span className="hub-xp-text">{Math.floor(xpIntoLevel)}/{xpNeeded} XP</span>
          </div>
          <div className="hub-bottom-row">
            <div className="hub-coins">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#ffd700" stroke="#b8960c" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><text x="12" y="16" textAnchor="middle" fontSize="12" fill="#b8960c" fontWeight="bold" stroke="none">C</text></svg>
              <span className="hub-coin-amount">{prog.coins.toLocaleString()}</span>
              <span className="hub-coin-label">COINS</span>
            </div>
            <button className="btn-shop" onClick={() => { setShowShop(true); setShopView('main'); }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
              SHOP
            </button>
          </div>
        </div>

        {/* ==================== SHOP OVERLAY ==================== */}
        {showShop && (
          <div className="cosmetics-overlay" onClick={() => setShowShop(false)}>
            <div className="cosmetics-shop" onClick={e => e.stopPropagation()}>

              {/* Shop Header */}
              <div className="cosmetics-header">
                <h2 className="cosmetics-title">
                  {shopView === 'main' ? 'SHOP' : shopView === 'collection' ? 'COLLECTION' : shopView === 'crates' ? 'CRATES' : shopView === 'daily' ? 'DAILY REWARDS' : 'REDEEM CODE'}
                </h2>
                <div className="shop-header-right">
                  <div className="shop-coin-badge">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="#ffd700" stroke="#b8960c" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><text x="12" y="16" textAnchor="middle" fontSize="12" fill="#b8960c" fontWeight="bold" stroke="none">C</text></svg>
                    <span>{prog.coins.toLocaleString()}</span>
                  </div>
                  <span className="cosmetics-level">LVL {prog.level}</span>
                  <button className="cosmetics-close" onClick={() => setShowShop(false)}>X</button>
                </div>
              </div>

              {/* Shop Navigation */}
              <div className="shop-nav">
                {([
                  { id: 'main' as ShopView, label: 'HOME' },
                  { id: 'crates' as ShopView, label: 'CRATES' },
                  { id: 'collection' as ShopView, label: 'COLLECTION' },
                  { id: 'daily' as ShopView, label: 'DAILY' },
                  { id: 'redeem' as ShopView, label: 'CODES' },
                ]).map(nav => (
                  <button
                    key={nav.id}
                    className={`shop-nav-btn ${shopView === nav.id ? 'active' : ''}`}
                    onClick={() => setShopView(nav.id)}
                  >
                    {nav.label}
                    {nav.id === 'daily' && !dailyClaimed && <span className="nav-badge">1</span>}
                  </button>
                ))}
              </div>

              {/* ====== HOME VIEW ====== */}
              {shopView === 'main' && (
                <div className="shop-home">
                  {/* Daily Reward Banner */}
                  {!dailyClaimed && (
                    <div className="daily-banner" onClick={() => setShopView('daily')}>
                      <div className="daily-banner-text">
                        <span className="daily-banner-title">DAILY REWARD AVAILABLE</span>
                        <span className="daily-banner-sub">Day {getDailyRewardIndex(prog) + 1} - {DAILY_REWARDS[getDailyRewardIndex(prog)].bonusLabel}</span>
                      </div>
                      <button className="btn btn-daily-claim" onClick={(e) => { e.stopPropagation(); claimDaily(); }}>CLAIM</button>
                    </div>
                  )}

                  {/* Quick Crate Cards */}
                  <div className="shop-section-label">OPEN CRATES</div>
                  <div className="crate-cards-row">
                    {LOOT_BOXES.map(box => (
                      <div
                        key={box.id}
                        className={`crate-card crate-${box.id.replace('box_', '')}`}
                        onClick={() => openBox(box)}
                        style={{ borderColor: prog.coins >= box.cost ? box.color : 'rgba(255,255,255,0.08)' }}
                      >
                        <div className="crate-visual" style={{ color: box.color }}>
                          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <rect x="2" y="8" width="20" height="14" rx="2"/>
                            <path d="M12 8V2M7 8l5-6 5 6"/>
                            <line x1="2" y1="14" x2="22" y2="14" strokeDasharray="2 2"/>
                          </svg>
                        </div>
                        <div className="crate-name">{box.name}</div>
                        <div className="crate-cost" style={{ color: prog.coins >= box.cost ? '#ffd700' : '#ff4444' }}>
                          {box.cost} coins
                        </div>
                        {prog.coins < box.cost && <div className="crate-need">Need {box.cost - prog.coins} more</div>}
                      </div>
                    ))}
                  </div>

                  {/* Pity Info */}
                  <div className="pity-info">
                    <span className="pity-label">Pity counter: {prog.pityCounter}/{PITY_THRESHOLD}</span>
                    <div className="pity-bar">
                      <div className="pity-bar-fill" style={{ width: `${(prog.pityCounter / PITY_THRESHOLD) * 100}%` }} />
                    </div>
                    <span className="pity-hint">Guaranteed epic after {PITY_THRESHOLD} opens without one</span>
                  </div>

                  {/* Stats */}
                  <div className="shop-stats">
                    <div className="stat-item"><span className="stat-value">{prog.boxesOpened}</span><span className="stat-label">Boxes Opened</span></div>
                    <div className="stat-item"><span className="stat-value">{prog.unlockedCosmetics.length}/{ALL_COSMETICS.length}</span><span className="stat-label">Collected</span></div>
                    <div className="stat-item"><span className="stat-value">{prog.totalCoinsEarned.toLocaleString()}</span><span className="stat-label">Total Coins</span></div>
                    <div className="stat-item"><span className="stat-value">{prog.dailyStreak}</span><span className="stat-label">Day Streak</span></div>
                  </div>
                </div>
              )}

              {/* ====== CRATES VIEW ====== */}
              {shopView === 'crates' && (
                <div className="shop-crates">
                  {LOOT_BOXES.map(box => (
                    <div key={box.id} className="crate-detail-card" style={{ borderColor: box.color }}>
                      <div className="crate-detail-head">
                        <div className="crate-detail-icon" style={{ color: box.color }}>
                          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <rect x="2" y="8" width="20" height="14" rx="2"/>
                            <path d="M12 8V2M7 8l5-6 5 6"/>
                            <line x1="2" y1="14" x2="22" y2="14" strokeDasharray="2 2"/>
                          </svg>
                        </div>
                        <div className="crate-detail-info">
                          <div className="crate-detail-name" style={{ color: box.color }}>{box.name}</div>
                          <div className="crate-detail-desc">{box.description}</div>
                          <div className="crate-detail-cost">
                            <span style={{ color: prog.coins >= box.cost ? '#ffd700' : '#ff4444' }}>{box.cost} coins</span>
                          </div>
                        </div>
                        <button
                          className="btn btn-open-crate"
                          style={{ borderColor: box.color, color: box.color }}
                          disabled={prog.coins < box.cost}
                          onClick={() => openBox(box)}
                        >
                          OPEN
                        </button>
                      </div>
                      <div className="crate-odds">
                        <div className="odds-title">DROP RATES</div>
                        <div className="odds-grid">
                          {(['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'] as CosmeticRarity[]).map(r => (
                            box.rates[r] > 0 ? (
                              <div key={r} className="odds-item">
                                <span className="odds-rarity" style={{ color: RARITY_COLORS[r] }}>{RARITY_LABELS[r]}</span>
                                <span className="odds-pct">{(box.rates[r] * 100).toFixed(1)}%</span>
                              </div>
                            ) : null
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}

                  <div className="pity-info pity-info-full">
                    <div className="pity-row">
                      <span className="pity-label">Epic pity: {prog.pityCounter}/{PITY_THRESHOLD}</span>
                      <div className="pity-bar"><div className="pity-bar-fill pity-epic" style={{ width: `${Math.min((prog.pityCounter / PITY_THRESHOLD) * 100, 100)}%` }} /></div>
                    </div>
                    <div className="pity-row">
                      <span className="pity-label">Legendary pity: {prog.pityCounter}/{LEGENDARY_PITY}</span>
                      <div className="pity-bar"><div className="pity-bar-fill pity-legendary" style={{ width: `${Math.min((prog.pityCounter / LEGENDARY_PITY) * 100, 100)}%` }} /></div>
                    </div>
                    <span className="pity-hint">Counters reset when you receive epic or higher</span>
                  </div>
                </div>
              )}

              {/* ====== COLLECTION VIEW ====== */}
              {shopView === 'collection' && (
                <div className="shop-collection">
                  <div className="cosmetics-tabs">
                    {(['skin', 'pet', 'trail', 'border', 'deathEffect'] as CosmeticType[]).map(tab => (
                      <button
                        key={tab}
                        className={`cosmetics-tab ${shopTab === tab ? 'active' : ''}`}
                        onClick={() => setShopTab(tab)}
                      >
                        {TAB_ICONS[tab]}
                        <span>{TAB_LABELS[tab]}</span>
                      </button>
                    ))}
                  </div>

                  <div className="cosmetics-grid">
                    {getShopItems().map(item => {
                      const unlocked = isUnlocked(item.id);
                      const equipped = isEquipped(item);
                      const petBonuses = item.type === 'pet' ? getPetBonusLabels(item.id) : [];
                      return (
                        <div
                          key={item.id}
                          className={`cosmetic-card ${unlocked ? 'unlocked' : 'locked'} ${equipped ? 'equipped' : ''} rarity-${item.rarity} ${item.type === 'pet' && petBonuses.length > 0 ? 'pet-card-bonus' : ''}`}
                          onClick={() => unlocked && equipCosmetic(item)}
                        >
                          {rarityDot(item.rarity)}
                          <div className="cosmetic-name">{item.name}</div>
                          <div className="cosmetic-rarity" style={{ color: RARITY_COLORS[item.rarity] }}>
                            {RARITY_LABELS[item.rarity]}
                          </div>
                          {petBonuses.length > 0 && (
                            <div className="pet-bonus-list">
                              {petBonuses.map((b, i) => (
                                <span key={i} className="pet-bonus-tag">{b}</span>
                              ))}
                            </div>
                          )}
                          {!unlocked && item.source === 'box' && (
                            <div className="cosmetic-lock cosmetic-box-only">CRATE ONLY</div>
                          )}
                          {!unlocked && item.source !== 'box' && (
                            <div className="cosmetic-lock">LVL {item.levelRequired}</div>
                          )}
                          {equipped && <div className="cosmetic-equipped-badge">EQUIPPED</div>}
                          <div className="cosmetic-desc">{item.description}</div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="cosmetics-progress">
                    <span>{prog.unlockedCosmetics.length}/{ALL_COSMETICS.length} unlocked</span>
                    <div className="cosmetics-progress-bar">
                      <div className="cosmetics-progress-fill" style={{ width: `${(prog.unlockedCosmetics.length / ALL_COSMETICS.length) * 100}%` }} />
                    </div>
                  </div>
                </div>
              )}

              {/* ====== DAILY REWARDS VIEW ====== */}
              {shopView === 'daily' && (
                <div className="shop-daily">
                  <div className="daily-streak-header">
                    <span className="daily-streak-count">{prog.dailyStreak} DAY STREAK</span>
                    <span className="daily-streak-sub">Log in daily to keep your streak</span>
                  </div>

                  <div className="daily-grid">
                    {DAILY_REWARDS.map((reward, idx) => {
                      const currentDay = getDailyRewardIndex(prog);
                      const isPast = idx < currentDay;
                      const isCurrent = idx === currentDay;
                      const isFuture = idx > currentDay;
                      return (
                        <div
                          key={idx}
                          className={`daily-card ${isPast ? 'claimed' : ''} ${isCurrent ? 'current' : ''} ${isFuture ? 'future' : ''}`}
                        >
                          <div className="daily-day">DAY {reward.day}</div>
                          <div className="daily-reward-label">{reward.bonusLabel}</div>
                          {isPast && <div className="daily-check">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#39ff14" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                          </div>}
                          {isCurrent && !dailyClaimed && (
                            <button className="btn btn-daily-claim-card" onClick={claimDaily}>CLAIM</button>
                          )}
                          {isCurrent && dailyClaimed && (
                            <div className="daily-check">
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#39ff14" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ====== REDEEM CODE VIEW ====== */}
              {shopView === 'redeem' && (
                <div className="shop-redeem">
                  <div className="redeem-icon">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ffd700" strokeWidth="1.5">
                      <rect x="2" y="6" width="20" height="14" rx="2"/>
                      <path d="M2 10h20M7 6V4a2 2 0 0 1 4 0v2M13 6V4a2 2 0 0 1 4 0v2"/>
                    </svg>
                  </div>
                  <div className="redeem-title">REDEEM A CODE</div>
                  <div className="redeem-sub">Enter a code to claim free coins and rewards</div>

                  <div className="redeem-input-row">
                    <input
                      className="redeem-input"
                      type="text"
                      placeholder="ENTER CODE..."
                      value={codeInput}
                      onChange={e => { setCodeInput(e.target.value.toUpperCase()); setCodeResult(null); }}
                      onKeyDown={e => e.key === 'Enter' && redeemCode()}
                      maxLength={20}
                      spellCheck={false}
                      autoComplete="off"
                    />
                    <button
                      className="btn btn-redeem"
                      onClick={redeemCode}
                      disabled={!codeInput.trim()}
                    >
                      REDEEM
                    </button>
                  </div>

                  {codeResult && (
                    <div className={`redeem-result ${codeResult.ok ? 'redeem-ok' : 'redeem-err'}`}>
                      {codeResult.ok ? '✓ ' : '✗ '}{codeResult.msg}
                    </div>
                  )}

                  <div className="redeem-hint">Codes can only be used once per account.</div>
                </div>
              )}

            </div>
          </div>
        )}

        {/* ==================== LOOT BOX OPENING OVERLAY ==================== */}
        {openingBox && boxResult && (
          <div className={`box-opening-overlay ${boxAnimPhase === 'reveal' ? `reveal-rarity-${boxResult.rarity}` : ''}`}>
            <div className={`box-opening-modal ${boxAnimPhase}`}>

              {/* Particle canvas renders behind the modal content */}
              {boxAnimPhase === 'reveal' && (
                <div className="reveal-particles-container">
                  {Array.from({ length: 30 }).map((_, i) => (
                    <div
                      key={i}
                      className={`reveal-particle particle-${i % 6}`}
                      style={{
                        '--px': `${Math.random() * 100}%`,
                        '--py': `${Math.random() * 100}%`,
                        '--delay': `${Math.random() * 0.5}s`,
                        '--size': `${3 + Math.random() * 6}px`,
                        '--color': RARITY_COLORS[boxResult.rarity],
                        '--angle': `${Math.random() * 360}deg`,
                        '--dist': `${80 + Math.random() * 150}px`,
                      } as React.CSSProperties}
                    />
                  ))}
                </div>
              )}

              {boxAnimPhase === 'spinning' && (
                <div className="box-spin-container">
                  <div className="box-spin-title" style={{ color: openingBox.color }}>{openingBox.name}</div>
                  <div className="box-crate-3d">
                    <div className="crate-3d-box" style={{ borderColor: openingBox.color }}>
                      <div className="crate-3d-face crate-3d-front" style={{ borderColor: openingBox.color }}>
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={openingBox.color} strokeWidth="1.5">
                          <rect x="2" y="8" width="20" height="14" rx="2"/>
                          <path d="M12 8V2M7 8l5-6 5 6"/>
                          <line x1="2" y1="14" x2="22" y2="14" strokeDasharray="2 2"/>
                        </svg>
                      </div>
                      <div className="crate-shake-glow" style={{ background: `radial-gradient(circle, ${openingBox.color}60 0%, transparent 70%)` }} />
                    </div>
                  </div>
                  <div className="box-reel-viewport">
                    <div className="box-reel-pointer" />
                    <div className="box-reel-strip">
                      {reelItems.map((ri, i) => (
                        <div key={i} className={`reel-item rarity-${ri.rarity}`}>
                          <span className="reel-item-dot" style={{ background: RARITY_COLORS[ri.rarity] }} />
                          <span className="reel-item-name">{ri.item.name}</span>
                          <span className="reel-item-rarity" style={{ color: RARITY_COLORS[ri.rarity] }}>{RARITY_LABELS[ri.rarity]}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="spin-suspense-text">OPENING...</div>
                </div>
              )}

              {boxAnimPhase === 'reveal' && (
                <div className={`box-reveal rarity-reveal-${boxResult.rarity}`}>
                  {/* Multi-layer glow */}
                  <div className="reveal-glow-outer" style={{ background: `radial-gradient(circle, ${RARITY_COLORS[boxResult.rarity]}20 0%, transparent 60%)` }} />
                  <div className="reveal-glow" style={{ background: `radial-gradient(circle, ${RARITY_COLORS[boxResult.rarity]}50 0%, transparent 70%)` }} />
                  <div className="reveal-flash" style={{ borderColor: RARITY_COLORS[boxResult.rarity] }} />

                  {/* Rarity banner */}
                  <div className="reveal-rarity-banner" style={{ color: RARITY_COLORS[boxResult.rarity], textShadow: `0 0 20px ${RARITY_COLORS[boxResult.rarity]}, 0 0 40px ${RARITY_COLORS[boxResult.rarity]}80` }}>
                    {RARITY_LABELS[boxResult.rarity]}
                  </div>

                  {/* Item icon placeholder with animated ring */}
                  <div className="reveal-item-showcase">
                    <div className="reveal-ring" style={{ borderColor: RARITY_COLORS[boxResult.rarity] }} />
                    <div className="reveal-ring reveal-ring-2" style={{ borderColor: RARITY_COLORS[boxResult.rarity] }} />
                    <div className="reveal-item-icon" style={{ background: `radial-gradient(circle, ${RARITY_COLORS[boxResult.rarity]}30 0%, transparent 70%)` }}>
                      <span className="reveal-item-dot-big" style={{ background: RARITY_COLORS[boxResult.rarity] }} />
                    </div>
                  </div>

                  <div className="reveal-name">{boxResult.item.name}</div>
                  <div className="reveal-type">{boxResult.item.type.toUpperCase()}</div>
                  <div className="reveal-desc">{boxResult.item.description}</div>

                  {/* Show pet bonuses on reveal! */}
                  {boxResult.item.type === 'pet' && getPetBonusLabels(boxResult.item.id).length > 0 && (
                    <div className="reveal-pet-bonuses">
                      <div className="reveal-bonus-title">STAT BONUSES</div>
                      {getPetBonusLabels(boxResult.item.id).map((b, i) => (
                        <span key={i} className="reveal-bonus-tag">{b}</span>
                      ))}
                    </div>
                  )}

                  {boxResult.isDuplicate && (
                    <div className="reveal-duplicate">
                      DUPLICATE -- +{DUPE_REFUND[boxResult.rarity]} coins refunded
                    </div>
                  )}
                  <div className="reveal-actions">
                    {!boxResult.isDuplicate && (
                      <button className="btn btn-equip btn-equip-glow" onClick={() => { equipCosmetic(boxResult.item); closeBoxReveal(); }}
                        style={{ boxShadow: `0 0 20px ${RARITY_COLORS[boxResult.rarity]}60` }}>
                        EQUIP NOW
                      </button>
                    )}
                    <button className="btn btn-reveal-close" onClick={closeBoxReveal}>
                      {prog.coins >= openingBox.cost ? 'OPEN ANOTHER' : 'CLOSE'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Queue status */}
        {queueStatus && (
          <div className="menu-queue-status">
            <div className="queue-spinner" />
            <span className="queue-message">{queueStatus.message}</span>
          </div>
        )}

        {/* Lobby view */}
        {lobbyInfo && (
          <div className="menu-lobby">
            <div className="lobby-header">
              <span className="lobby-title">{lobbyInfo.gameMode === 'teams' ? '2v2 TEAMS' : 'FFA'} LOBBY</span>
              <span
                className={`lobby-code clickable${copied ? ' copied' : ''}`}
                onClick={() => {
                  navigator.clipboard.writeText(lobbyInfo.code).then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }).catch(() => {});
                }}
                title="Click to copy code"
              >
                {lobbyInfo.code}
                <span className="lobby-code-copy-icon">{copied ? ' OK' : ' COPY'}</span>
              </span>
            </div>
            <div className="lobby-players">
              {lobbyInfo.gameMode === 'teams' ? (
                <div className="lobby-teams">
                  <div className="lobby-team lobby-team-1">
                    <span className="team-label">TEAM 1</span>
                    {lobbyInfo.players.filter(p => p.team === 1).map(p => (
                      <div key={p.id} className={`lobby-player ${p.ready ? 'ready' : ''}`}>
                        <span className="lobby-player-name">{p.name}</span>
                        {p.ready && <span className="lobby-ready-badge">READY</span>}
                      </div>
                    ))}
                    {lobbyInfo.players.filter(p => p.team === 1).length < 2 && (
                      <div className="lobby-player-empty">Waiting...</div>
                    )}
                  </div>
                  <div className="lobby-vs">VS</div>
                  <div className="lobby-team lobby-team-2">
                    <span className="team-label">TEAM 2</span>
                    {lobbyInfo.players.filter(p => p.team === 2).map(p => (
                      <div key={p.id} className={`lobby-player ${p.ready ? 'ready' : ''}`}>
                        <span className="lobby-player-name">{p.name}</span>
                        {p.ready && <span className="lobby-ready-badge">READY</span>}
                      </div>
                    ))}
                    {lobbyInfo.players.filter(p => p.team === 2).length < 2 && (
                      <div className="lobby-player-empty">Waiting...</div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="lobby-ffa-list">
                  {lobbyInfo.players.map(p => (
                    <div key={p.id} className={`lobby-player ${p.ready ? 'ready' : ''}`}>
                      <span className="lobby-player-name">{p.name}</span>
                      {p.ready && <span className="lobby-ready-badge">READY</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="lobby-actions">
              {lobbyInfo.gameMode === 'teams' && onLobbySetTeam && (
                <div className="lobby-team-buttons">
                  <button className="btn btn-sm" onClick={() => onLobbySetTeam(1)}>Join Team 1</button>
                  <button className="btn btn-sm" onClick={() => onLobbySetTeam(2)}>Join Team 2</button>
                </div>
              )}
              {onLobbyToggleReady && (
                <button className="btn btn-accent" onClick={onLobbyToggleReady}>
                  TOGGLE READY
                </button>
              )}
              {onLobbyStartGame && playerId === lobbyInfo.hostId && (
                <button className="btn btn-primary" onClick={onLobbyStartGame}>
                  START GAME
                </button>
              )}
              {lobbyInfo.hostId !== playerId && (
                <div className="lobby-host-hint">Waiting for <strong>{lobbyInfo.hostName}</strong> to start...</div>
              )}
            </div>
          </div>
        )}

        {/* Normal menu (only show when not in a lobby) */}
        {!lobbyInfo && !queueStatus && (
          <div className="menu-buttons">
            <input
              className="menu-input menu-name-input"
              type="text"
              placeholder="Enter your name..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={16}
              id="player-name-input"
            />

            <div className="mode-toggle">
              <button
                className={`mode-btn ${gameMode === 'ffa' ? 'active' : ''}`}
                onClick={() => setGameMode('ffa')}
              >
                FREE-FOR-ALL
              </button>
              <button
                className={`mode-btn ${gameMode === 'teams' ? 'active' : ''}`}
                onClick={() => setGameMode('teams')}
              >
                2v2 TEAMS
              </button>
            </div>

            <button
              className="btn btn-primary"
              onClick={() => onPlay(playerName, gameMode)}
              disabled={connecting}
              id="play-button"
            >
              {connecting ? 'CONNECTING...' : gameMode === 'teams' ? 'FIND 2v2 MATCH' : 'PLAY NOW'}
            </button>

            <button
              className="btn btn-secondary"
              onClick={() => onCreateLobby(playerName, gameMode)}
              disabled={connecting}
              id="create-lobby-button"
            >
              {gameMode === 'teams' ? 'CREATE 2v2 LOBBY' : 'CREATE LOBBY'}
            </button>

            <div className="menu-divider">
              <span className="menu-divider-line" />
              <span className="menu-divider-text">OR JOIN</span>
              <span className="menu-divider-line" />
            </div>

            <div className="join-row">
              <input
                className="menu-input"
                type="text"
                placeholder="Room code"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                maxLength={5}
                id="join-code-input"
              />
              <button
                className="btn btn-accent"
                onClick={() => onJoinLobby(playerName, joinCode)}
                disabled={connecting || joinCode.length < 3}
                id="join-button"
              >
                JOIN
              </button>
            </div>

            {roomCode && (
              <div className="room-code-display">
                <span className="room-code-label">ROOM CODE</span>
                <div className="room-code-value" onClick={handleCopyCode} title="Click to copy">
                  <span className="room-code-text">{roomCode}</span>
                  <span className="room-code-copy">
                    {copied ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#39ff14" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"></polyline>
                      </svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                      </svg>
                    )}
                  </span>
                </div>
                {copied && <span className="room-code-copied">Copied!</span>}
              </div>
            )}

            {error && <div className="menu-error">{error}</div>}
          </div>
        )}

        {error && !lobbyInfo && !queueStatus && <div className="menu-error">{error}</div>}

        <div className="menu-footer">
          <span className="menu-footer-text">SPACE = snap camera</span>
          <span className="menu-footer-sep">|</span>
          <span className="menu-footer-text">Q/W/E = abilities</span>
          <span className="menu-footer-sep">|</span>
          <span className="menu-footer-text">RIGHT-CLICK = pan</span>
        </div>
      </div>
    </div>
  );
}
