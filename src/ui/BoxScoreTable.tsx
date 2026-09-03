import type { PlayerGameStats, TeamDef, TeamGameStats } from '../engine'

interface BoxScoreTableProps {
  team: TeamDef
  teamStats: TeamGameStats
  playerStats: PlayerGameStats[]
}

function fmtMin(seconds: number): string {
  return (seconds / 60).toFixed(1)
}

function split(made: number, attempted: number): string {
  return `${made}-${attempted}`
}

export function BoxScoreTable({ team, teamStats, playerStats }: BoxScoreTableProps) {
  const nameOf = (playerId: string) => team.players.find((p) => p.id === playerId)?.name ?? playerId
  const numberOf = (playerId: string) => team.players.find((p) => p.id === playerId)?.number

  const rows = [...playerStats].sort((a, b) => b.secondsPlayed - a.secondsPlayed)

  return (
    <table className="box-score">
      <caption style={{ color: team.primaryColor }}>{team.name}</caption>
      <thead>
        <tr>
          <th scope="col">Player</th>
          <th scope="col">MIN</th>
          <th scope="col">PTS</th>
          <th scope="col">FG</th>
          <th scope="col">3P</th>
          <th scope="col">FT</th>
          <th scope="col">REB</th>
          <th scope="col">AST</th>
          <th scope="col">TO</th>
          <th scope="col">PF</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((p) => (
          <tr key={p.playerId}>
            <td>
              #{numberOf(p.playerId)} {nameOf(p.playerId)}
            </td>
            <td>{fmtMin(p.secondsPlayed)}</td>
            <td>{p.points}</td>
            <td>{split(p.fgMade, p.fgAttempted)}</td>
            <td>{split(p.threeMade, p.threeAttempted)}</td>
            <td>{split(p.ftMade, p.ftAttempted)}</td>
            <td>{p.offensiveRebounds + p.defensiveRebounds}</td>
            <td>{p.assists}</td>
            <td>{p.turnovers}</td>
            <td>{p.personalFouls}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td>Total</td>
          <td></td>
          <td>{teamStats.points}</td>
          <td>{split(teamStats.fgMade, teamStats.fgAttempted)}</td>
          <td>{split(teamStats.threeMade, teamStats.threeAttempted)}</td>
          <td>{split(teamStats.ftMade, teamStats.ftAttempted)}</td>
          <td>{teamStats.offensiveRebounds + teamStats.defensiveRebounds}</td>
          <td>{teamStats.assists}</td>
          <td>{teamStats.turnovers}</td>
          <td>{teamStats.personalFouls}</td>
        </tr>
      </tfoot>
    </table>
  )
}
