interface PlayByPlayFeedProps {
  lines: string[] // newest first
}

export function PlayByPlayFeed({ lines }: PlayByPlayFeedProps) {
  return (
    <div className="play-by-play">
      <h2>Play-by-Play</h2>
      <ol className="play-by-play-list">
        {lines.length === 0 && <li className="play-by-play-empty">Simulate a game to see the play-by-play.</li>}
        {lines.map((line, i) => (
          <li key={`${lines.length - i}-${line}`}>{line}</li>
        ))}
      </ol>
    </div>
  )
}
