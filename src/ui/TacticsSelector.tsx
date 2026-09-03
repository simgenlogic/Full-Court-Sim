import type { DefenseStyle, OffenseStyle, TeamDef } from '../engine'

const OFFENSE_STYLES: OffenseStyle[] = ['balanced', 'pick-and-roll', 'drive-and-kick', 'motion']
const DEFENSE_STYLES: DefenseStyle[] = ['drop', 'switch', 'help-heavy']

interface TacticsSelectorProps {
  team: TeamDef
  offenseStyle: OffenseStyle
  defenseStyle: DefenseStyle
  onOffenseStyleChange: (style: OffenseStyle) => void
  onDefenseStyleChange: (style: DefenseStyle) => void
}

export function TacticsSelector({ team, offenseStyle, defenseStyle, onOffenseStyleChange, onDefenseStyleChange }: TacticsSelectorProps) {
  return (
    <div className="tactics-selector">
      <h3 style={{ color: team.primaryColor }}>{team.name}</h3>
      <label>
        Offense
        <select value={offenseStyle} onChange={(e) => onOffenseStyleChange(e.target.value as OffenseStyle)}>
          {OFFENSE_STYLES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <label>
        Defense
        <select value={defenseStyle} onChange={(e) => onDefenseStyleChange(e.target.value as DefenseStyle)}>
          {DEFENSE_STYLES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}
