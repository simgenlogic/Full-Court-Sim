import type { PlaybackSpeed } from '../render/EventPlayer'

interface ControlsProps {
  seed: number
  onSeedChange: (seed: number) => void
  onSimulate: () => void
  onPlayPause: () => void
  onReset: () => void
  onSetSpeed: (speed: PlaybackSpeed) => void
  onNextPossession: () => void
  onSkipToEnd: () => void
  isPlaying: boolean
  speed: PlaybackSpeed
  hasGame: boolean
}

const SPEEDS: PlaybackSpeed[] = [1, 2, 4, 8]

export function Controls({
  seed,
  onSeedChange,
  onSimulate,
  onPlayPause,
  onReset,
  onSetSpeed,
  onNextPossession,
  onSkipToEnd,
  isPlaying,
  speed,
  hasGame,
}: ControlsProps) {
  return (
    <div className="controls">
      <div className="controls-row">
        <label className="seed-input">
          Seed
          <input
            type="number"
            value={seed}
            onChange={(e) => onSeedChange(Number(e.target.value))}
          />
        </label>
        <button type="button" className="primary" onClick={onSimulate}>
          Simulate Game
        </button>
      </div>
      <div className="controls-row">
        <button type="button" onClick={onPlayPause} disabled={!hasGame}>
          {isPlaying ? 'Pause' : 'Start'}
        </button>
        <button type="button" onClick={onReset} disabled={!hasGame}>
          Reset
        </button>
        <button type="button" onClick={onNextPossession} disabled={!hasGame}>
          Next Possession
        </button>
        <button type="button" onClick={onSkipToEnd} disabled={!hasGame}>
          Skip to End
        </button>
        <div className="speed-buttons">
          {SPEEDS.map((s) => (
            <button
              type="button"
              key={s}
              className={s === speed ? 'speed-active' : ''}
              onClick={() => onSetSpeed(s)}
              disabled={!hasGame}
            >
              {s}x
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
