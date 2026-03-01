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
    title: '🔗 WELCOME TO LINK.IO',
    description: 'Build energy networks. Crush your opponents. Last network standing wins!',
    hint: 'This is a 3-minute arena brawl. Let\'s learn the basics.',
    icon: '⚡',
  },
  {
    title: '🎯 YOUR CORE NODE',
    description: 'The bright glowing node is YOUR CORE. This is your network\'s heart. If it falls, you\'re eliminated!',
    hint: 'Your core generates energy. Protect it at all costs.',
    icon: '💎',
  },
  {
    title: '🖱️ CREATE LINKS',
    description: 'Click and DRAG from your core node to any nearby neutral node. This creates an energy link!',
    hint: 'Left-click on your node → hold → drag to a gray node → release. That\'s it!',
    icon: '🔗',
  },
  {
    title: '⚡ ENERGY NETWORKS',
    description: 'Connected nodes generate energy over time. More nodes = more energy = more power!',
    hint: 'Links cost energy to create. Build efficiently to maximize your network.',
    icon: '🌐',
  },
  {
    title: '💥 ATTACK ENEMIES',
    description: 'Connect YOUR nodes to ENEMY nodes to attack them! Enemy links take damage and eventually break.',
    hint: 'When an enemy\'s link breaks, all downstream nodes disconnect and become neutral — grab them!',
    icon: '⚔️',
  },
  {
    title: '🏆 WIN CONDITION',
    description: 'Last surviving network wins. Or, if time runs out, highest energy score takes the crown!',
    hint: 'Be aggressive! Territory control is king. Passive play loses.',
    icon: '👑',
  },
  {
    title: '🎮 CONTROLS',
    description: 'Left-click + drag: Create links | Right-click + drag: Pan camera | Scroll wheel: Zoom in/out',
    hint: 'You\'re ready! Go dominate the arena! 🚀',
    icon: '🕹️',
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
        {/* Progress bar */}
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
        <p className="tutorial-desc">{current.description}</p>
        <p className="tutorial-hint">💡 {current.hint}</p>

        <div className="tutorial-buttons">
          {step > 0 && (
            <button
              className="btn btn-secondary tutorial-btn"
              onClick={() => setStep(step - 1)}
              id="tutorial-back-button"
            >
              ← Back
            </button>
          )}
          {!isLast ? (
            <button
              className="btn btn-primary tutorial-btn"
              onClick={() => setStep(step + 1)}
              id="tutorial-next-button"
            >
              Next →
            </button>
          ) : (
            <button
              className="btn btn-accent tutorial-btn"
              onClick={onComplete}
              id="tutorial-start-button"
            >
              ⚡ LET'S GO!
            </button>
          )}
        </div>

        <button
          className="tutorial-skip"
          onClick={onComplete}
          id="tutorial-skip-button"
        >
          Skip Tutorial
        </button>
      </div>
    </div>
  );
}
