import { useState } from 'react'
import { ironhawks, thunderbolts } from '../data/teams'
import { simulateGame } from '../engine'
import type { DefenseStyle, OffenseStyle } from '../engine'
import { EventPlayer } from '../render/EventPlayer'
import type { PlaybackSpeed } from '../render/EventPlayer'
import { BoxScoreTable } from './BoxScoreTable'
import { Controls } from './Controls'
import { CourtCanvas } from './CourtCanvas'
import { PlayByPlayFeed } from './PlayByPlayFeed'
import { Scoreboard } from './Scoreboard'
import { TacticsSelector } from './TacticsSelector'
import { TeamSetup } from './TeamSetup'
import { useGamePlayback } from './hooks/useGamePlayback'
import './app.css'

function App() {
  const [seed, setSeed] = useState(1)
  const [homeOffense, setHomeOffense] = useState<OffenseStyle>(ironhawks.defaultOffenseStyle)
  const [homeDefense, setHomeDefense] = useState<DefenseStyle>(ironhawks.defaultDefenseStyle)
  const [awayOffense, setAwayOffense] = useState<OffenseStyle>(thunderbolts.defaultOffenseStyle)
  const [awayDefense, setAwayDefense] = useState<DefenseStyle>(thunderbolts.defaultDefenseStyle)
  const [speed, setSpeed] = useState<PlaybackSpeed>(1)
  const [player, setPlayer] = useState<EventPlayer | null>(null)

  const renderState = useGamePlayback(player)

  function handleSimulate() {
    const state = simulateGame(ironhawks, thunderbolts, seed, {
      homeOffenseStyle: homeOffense,
      homeDefenseStyle: homeDefense,
      awayOffenseStyle: awayOffense,
      awayDefenseStyle: awayDefense,
    })
    const next = new EventPlayer(state.events, ironhawks, thunderbolts)
    next.setSpeed(speed)
    next.play()
    setPlayer(next)
  }

  function handlePlayPause() {
    if (!player) return
    if (renderState?.isPlaying) player.pause()
    else player.play()
  }

  function handleSetSpeed(next: PlaybackSpeed) {
    setSpeed(next)
    player?.setSpeed(next)
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Full Court Sim</h1>
        <p>An autonomous 2D basketball game simulator</p>
      </header>

      <Scoreboard homeTeam={ironhawks} awayTeam={thunderbolts} score={renderState?.score ?? null} clock={renderState?.clock ?? null} />

      <Controls
        seed={seed}
        onSeedChange={setSeed}
        onSimulate={handleSimulate}
        onPlayPause={handlePlayPause}
        onReset={() => player?.reset()}
        onSetSpeed={handleSetSpeed}
        onNextPossession={() => player?.stepToNextPossession()}
        onSkipToEnd={() => player?.skipToEnd()}
        isPlaying={renderState?.isPlaying ?? false}
        speed={speed}
        hasGame={player !== null}
      />

      <main className="app-main">
        <section className="court-section">
          <CourtCanvas player={player} homeTeam={ironhawks} awayTeam={thunderbolts} />
        </section>
        <aside className="side-panel">
          <PlayByPlayFeed lines={renderState?.playByPlay ?? []} />
        </aside>
      </main>

      <section className="tactics-section">
        <TacticsSelector
          team={ironhawks}
          offenseStyle={homeOffense}
          defenseStyle={homeDefense}
          onOffenseStyleChange={setHomeOffense}
          onDefenseStyleChange={setHomeDefense}
        />
        <TacticsSelector
          team={thunderbolts}
          offenseStyle={awayOffense}
          defenseStyle={awayDefense}
          onOffenseStyleChange={setAwayOffense}
          onDefenseStyleChange={setAwayDefense}
        />
      </section>

      {renderState && (
        <section className="box-score-section">
          <BoxScoreTable team={ironhawks} teamStats={renderState.boxScore.home.team} playerStats={renderState.boxScore.home.players} />
          <BoxScoreTable team={thunderbolts} teamStats={renderState.boxScore.away.team} playerStats={renderState.boxScore.away.players} />
        </section>
      )}

      <section className="roster-section">
        <TeamSetup team={ironhawks} />
        <TeamSetup team={thunderbolts} />
      </section>
    </div>
  )
}

export default App
