import { useEffect, useRef } from 'react'
import type { TeamDef } from '../engine'
import { drawCourt, drawScene } from '../render/CourtRenderer'
import type { EventPlayer } from '../render/EventPlayer'

const CANVAS_WIDTH = 940
const CANVAS_HEIGHT = 500

interface CourtCanvasProps {
  player: EventPlayer | null
  homeTeam: TeamDef
  awayTeam: TeamDef
}

/** Subscribes directly to the EventPlayer (not through React state) so the court can redraw every
 * animation frame without forcing a React re-render of the surrounding UI. */
export function CourtCanvas({ player, homeTeam, awayTeam }: CourtCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!ctx) return

    if (!player) {
      drawCourt(ctx, CANVAS_WIDTH, CANVAS_HEIGHT)
      return
    }

    const colorOf = (teamId: string) => (teamId === homeTeam.id ? homeTeam.primaryColor : awayTeam.primaryColor)

    return player.onFrame((state) => {
      drawScene(ctx, CANVAS_WIDTH, CANVAS_HEIGHT, {
        mirror: state.mirror,
        ballXY: state.ballXY,
        players: state.players.map((p) => ({
          playerId: p.playerId,
          xy: p.xy,
          number: p.number,
          fillColor: colorOf(p.teamId),
          textColor: '#ffffff',
          hasBall: p.hasBall,
        })),
      })
    })
  }, [player, homeTeam, awayTeam])

  return (
    <canvas
      ref={canvasRef}
      width={CANVAS_WIDTH}
      height={CANVAS_HEIGHT}
      style={{ width: '100%', height: 'auto', aspectRatio: `${CANVAS_WIDTH} / ${CANVAS_HEIGHT}`, borderRadius: 8, display: 'block' }}
    />
  )
}
