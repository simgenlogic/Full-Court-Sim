import type { TeamDef } from '../engine'

interface TeamSetupProps {
  team: TeamDef
}

export function TeamSetup({ team }: TeamSetupProps) {
  return (
    <div className="team-setup">
      <h3 style={{ color: team.primaryColor }}>{team.name}</h3>
      <div className="table-scroll">
        <table className="roster-table">
          <thead>
            <tr>
              <th scope="col">Player</th>
              <th scope="col">Pos</th>
              <th scope="col">FIN</th>
              <th scope="col">3PT</th>
              <th scope="col">PASS</th>
              <th scope="col">HNDL</th>
              <th scope="col">P.DEF</th>
              <th scope="col">I.DEF</th>
              <th scope="col">REB</th>
              <th scope="col">SPD</th>
              <th scope="col">STA</th>
            </tr>
          </thead>
          <tbody>
            {team.players.map((p, i) => (
              <tr key={p.id} className={i < 5 ? 'starter' : 'bench'}>
                <td>
                  #{p.number} {p.name}
                </td>
                <td>{p.position}</td>
                <td>{p.ratings.finishing}</td>
                <td>{p.ratings.threePoint}</td>
                <td>{p.ratings.passing}</td>
                <td>{p.ratings.ballHandling}</td>
                <td>{p.ratings.perimeterDefense}</td>
                <td>{p.ratings.interiorDefense}</td>
                <td>{p.ratings.rebounding}</td>
                <td>{p.ratings.speed}</td>
                <td>{p.ratings.stamina}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
