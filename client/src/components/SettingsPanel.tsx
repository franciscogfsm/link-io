// ============================================================
// LINK.IO Client - Settings Panel
// Audio volume controls with sliders
// ============================================================

import React, { useState, useCallback } from 'react';
import { audioManager } from '../game/AudioManager';

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SettingsPanel({ isOpen, onClose }: SettingsPanelProps) {
  const [settings, setSettings] = useState(audioManager.getSettings());

  const update = useCallback(() => {
    setSettings(audioManager.getSettings());
  }, []);

  if (!isOpen) return null;

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2 className="settings-title">SETTINGS</h2>
          <button className="settings-close" onClick={onClose}>✕</button>
        </div>

        <div className="settings-section">
          <h3 className="settings-section-title">AUDIO</h3>

          {/* Mute toggle */}
          <div className="settings-row">
            <span className="settings-label">Sound</span>
            <button
              className={`settings-toggle ${!settings.muted ? 'active' : ''}`}
              onClick={() => {
                audioManager.toggleMute();
                audioManager.playClick();
                update();
              }}
            >
              {settings.muted ? '🔇 MUTED' : '🔊 ON'}
            </button>
          </div>

          {/* Master Volume */}
          <VolumeSlider
            label="Master"
            value={settings.masterVolume}
            onChange={(v) => {
              audioManager.setMasterVolume(v);
              update();
            }}
            color="#00f0ff"
          />

          {/* SFX Volume */}
          <VolumeSlider
            label="SFX"
            value={settings.sfxVolume}
            onChange={(v) => {
              audioManager.setSfxVolume(v);
              update();
            }}
            color="#39ff14"
          />

          {/* Music Volume */}
          <VolumeSlider
            label="Music"
            value={settings.musicVolume}
            onChange={(v) => {
              audioManager.setMusicVolume(v);
              update();
            }}
            color="#ff006e"
          />

          {/* UI Volume */}
          <VolumeSlider
            label="UI"
            value={settings.uiVolume}
            onChange={(v) => {
              audioManager.setUiVolume(v);
              update();
            }}
            color="#ffbe0b"
          />

          {/* Test sound button */}
          <div className="settings-row" style={{ marginTop: 16 }}>
            <button
              className="settings-test-btn"
              onClick={() => {
                audioManager.init();
                audioManager.playNodeCapture();
              }}
            >
              🔔 Test Sound
            </button>
          </div>
        </div>

        <div className="settings-footer">
          <span className="settings-hint">Settings are saved automatically</span>
        </div>
      </div>
    </div>
  );
}

// ============ Volume Slider Component ============

function VolumeSlider({
  label,
  value,
  onChange,
  color,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  color: string;
}) {
  const percent = Math.round(value * 100);

  return (
    <div className="settings-row">
      <span className="settings-label">{label}</span>
      <div className="settings-slider-container">
        <input
          type="range"
          min={0}
          max={100}
          value={percent}
          onChange={(e) => onChange(Number(e.target.value) / 100)}
          className="settings-slider"
          style={{
            '--slider-color': color,
            '--slider-percent': `${percent}%`,
          } as React.CSSProperties}
        />
        <span className="settings-slider-value" style={{ color }}>
          {percent}%
        </span>
      </div>
    </div>
  );
}
