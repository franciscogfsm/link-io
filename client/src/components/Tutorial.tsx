// ============================================================
// LINK.IO Client - Tutorial Component
// Step-by-step interactive tutorial overlay
// ============================================================

import { useState } from 'react';

interface TutorialProps {
  onComplete: () => void;
}

const TUTORIAL_STEPS = [
  {
    title: 'WELCOME TO LINK.IO',
    description: 'Build energy networks. Use abilities. Crush opponents. The most DOMINANT network wins!',
    hint: 'This is a 3-minute competitive arena brawl. Let\'s learn the basics.',
    icon: '[!]',
  },
  {
    title: 'YOUR CORE NODE',
    description: 'The bright glowing node is YOUR CORE. It\'s the heart of your network. If it falls, you\'re eliminated!',
    hint: 'Your core generates energy. Protect it at all costs.',
    icon: '[C]',
  },
  {
    title: 'CREATE LINKS',
    description: 'Click and DRAG from your core to any nearby neutral node to create an energy link and claim territory!',
    hint: 'Left-click on your node → hold → drag to a gray node → release. Green circles show valid targets!',
    icon: '[+]',
  },
  {
    title: 'SPECIAL NODES',
    description: 'Golden ★ nodes give 3× energy! Purple MEGA nodes speed up your ability cooldowns!',
    hint: 'Rush for power nodes early—they\'re game changers!',
    icon: '[*]',
  },
  {
    title: 'COMBO SYSTEM',
    description: 'Chain links quickly within 3 seconds to build COMBOS! Each combo level gives bonus energy!',
    hint: 'x3 COMBO = +15 energy, x5 = +25... Build fast, score big!',
    icon: '[MAX]',
  },
  {
    title: 'ABILITIES',
    description: 'SURGE (Q): Damage nearby enemy links\nSHIELD (R): Protect your network for 5s\nEMP (E): Blast radius from your core\nWASD: Move your core (costs energy, stretches links!)',
    hint: 'Moving costs energy and big networks are SLOWER. Run too far and links SNAP!',
    icon: '[PWR]',
  },
  {
    title: 'ATTACK & DEFEND',
    description: 'Link YOUR nodes to ENEMY nodes to attack! Their links take damage and break. Shielded links are immune!',
    hint: 'Break enemy links → disconnect their nodes → steal territory!',
    icon: '[VS]',
  },
  {
    title: 'WIN CONDITION',
    description: 'Eliminate all enemies OR have the highest SCORE when time runs out! Score = Territory + Kills + Combos!',
    hint: 'Be aggressive! Use the 1-4 keys to activate emotes. Now GO DOMINATE!',
    icon: '[WIN]',
  },
];

export default function Tutorial({ onComplete }: TutorialProps) {
  const [step, setStep] = useState(0);
  const current = TUTORIAL_STEPS[step];
  const isLast = step === TUTORIAL_STEPS.length - 1;
  const progress = ((step + 1) / TUTORIAL_STEPS.length) * 100;

  return (
    <div className="tutorial-overlay" id="tutorial-overlay">
      <div className="tutorial-card">
        <div className="tutorial-progress">
          <div className="tutorial-progress-fill" style={{ width: `${progress}%` }} />
        </div>

        <div className="tutorial-step-indicator">
          {TUTORIAL_STEPS.map((_, i) => (
            <div
              key={i}
              className={`tutorial-dot ${i === step ? 'active' : ''} ${i < step ? 'done' : ''}`}
            />
          ))}
        </div>

        <div className="tutorial-icon">{current.icon}</div>
        <h2 className="tutorial-title">{current.title}</h2>
        <p className="tutorial-desc" style={{ whiteSpace: 'pre-line' }}>{current.description}</p>
        <p className="tutorial-hint">TIP: {current.hint}</p>

        <div className="tutorial-buttons">
          {step > 0 && (
            <button className="btn btn-secondary tutorial-btn" onClick={() => setStep(step - 1)} id="tutorial-back-button">
              ← Back
            </button>
          )}
          {!isLast ? (
            <button className="btn btn-primary tutorial-btn" onClick={() => setStep(step + 1)} id="tutorial-next-button">
              Next →
            </button>
          ) : (
            <button className="btn btn-accent tutorial-btn" onClick={onComplete} id="tutorial-start-button">
              LET'S GO!
            </button>
          )}
        </div>

        <button className="tutorial-skip" onClick={onComplete} id="tutorial-skip-button">
          Skip Tutorial
        </button>
      </div>
    </div>
  );
}
