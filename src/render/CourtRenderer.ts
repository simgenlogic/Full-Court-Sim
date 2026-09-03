import { toCanvasXY } from './courtGeometry'
import type { CourtPoint } from '../engine'

export interface CourtRenderPlayer {
  playerId: string
  xy: CourtPoint
  number: number
  fillColor: string
  textColor: string
  hasBall: boolean
}

export interface CourtRenderScene {
  players: CourtRenderPlayer[]
  ballXY: CourtPoint
  mirror: boolean
}

const PLAYER_RADIUS = 11
const BALL_RADIUS = 5

/** Static court markings — lines, key, arcs, center circle — drawn in court-feet units. */
export function drawCourt(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const p = (point: CourtPoint) => toCanvasXY(point, width, height, false)
  const scaleX = width / 94
  const scaleY = height / 50

  ctx.save()
  ctx.fillStyle = '#c98a4b'
  ctx.fillRect(0, 0, width, height)

  ctx.strokeStyle = 'rgba(255,255,255,0.85)'
  ctx.lineWidth = 2
  ctx.strokeRect(1, 1, width - 2, height - 2)

  // Halfcourt line + center circle
  ctx.beginPath()
  ctx.moveTo(p({ x: 47, y: 0 }).x, 0)
  ctx.lineTo(p({ x: 47, y: 50 }).x, height)
  ctx.stroke()
  ctx.beginPath()
  ctx.ellipse(p({ x: 47, y: 25 }).x, p({ x: 47, y: 25 }).y, 6 * scaleX, 6 * scaleY, 0, 0, Math.PI * 2)
  ctx.stroke()

  for (const side of [0, 94] as const) {
    const isLeft = side === 0
    const basketX = isLeft ? 5.25 : 88.75
    const keyXRange: [number, number] = isLeft ? [0, 19] : [75, 94]

    // Key (paint)
    const topLeft = p({ x: keyXRange[0], y: 17 })
    const bottomRight = p({ x: keyXRange[1], y: 33 })
    ctx.strokeRect(Math.min(topLeft.x, bottomRight.x), topLeft.y, Math.abs(bottomRight.x - topLeft.x), bottomRight.y - topLeft.y)

    // Free-throw circle
    const ftCenter = p({ x: isLeft ? 19 : 75, y: 25 })
    ctx.beginPath()
    ctx.ellipse(ftCenter.x, ftCenter.y, 6 * scaleX, 6 * scaleY, 0, 0, Math.PI * 2)
    ctx.stroke()

    // Three-point arc (approximate: arc + straight corner segments)
    const basketCanvas = p({ x: basketX, y: 25 })
    const radiusX = 23.75 * scaleX
    const radiusY = 23.75 * scaleY
    const startAngle = isLeft ? -Math.PI / 2.6 : Math.PI - Math.PI / 2.6
    const endAngle = isLeft ? Math.PI / 2.6 : Math.PI + Math.PI / 2.6
    ctx.beginPath()
    ctx.ellipse(basketCanvas.x, basketCanvas.y, radiusX, radiusY, 0, startAngle, endAngle, isLeft)
    ctx.stroke()

    // Basket + backboard
    ctx.beginPath()
    ctx.ellipse(basketCanvas.x, basketCanvas.y, 1.1 * scaleX, 1.1 * scaleY, 0, 0, Math.PI * 2)
    ctx.strokeStyle = '#ff5a1f'
    ctx.stroke()
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'
    const backboardX = isLeft ? basketX - 2 : basketX + 2
    const bTop = p({ x: backboardX, y: 22 })
    const bBottom = p({ x: backboardX, y: 28 })
    ctx.beginPath()
    ctx.moveTo(bTop.x, bTop.y)
    ctx.lineTo(bBottom.x, bBottom.y)
    ctx.stroke()
  }

  ctx.restore()
}

export function drawScene(ctx: CanvasRenderingContext2D, width: number, height: number, scene: CourtRenderScene): void {
  drawCourt(ctx, width, height)

  for (const player of scene.players) {
    const pos = toCanvasXY(player.xy, width, height, scene.mirror)

    if (player.hasBall) {
      ctx.beginPath()
      ctx.ellipse(pos.x, pos.y, PLAYER_RADIUS + 3, PLAYER_RADIUS + 3, 0, 0, Math.PI * 2)
      ctx.strokeStyle = '#ffd400'
      ctx.lineWidth = 2
      ctx.stroke()
    }

    ctx.beginPath()
    ctx.ellipse(pos.x, pos.y, PLAYER_RADIUS, PLAYER_RADIUS, 0, 0, Math.PI * 2)
    ctx.fillStyle = player.fillColor
    ctx.fill()
    ctx.lineWidth = 1.5
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'
    ctx.stroke()

    ctx.fillStyle = player.textColor
    ctx.font = 'bold 11px system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(player.number), pos.x, pos.y)
  }

  const ballPos = toCanvasXY(scene.ballXY, width, height, scene.mirror)
  ctx.beginPath()
  ctx.ellipse(ballPos.x, ballPos.y, BALL_RADIUS, BALL_RADIUS, 0, 0, Math.PI * 2)
  ctx.fillStyle = '#e8790c'
  ctx.fill()
  ctx.lineWidth = 1
  ctx.strokeStyle = 'rgba(0,0,0,0.5)'
  ctx.stroke()
}
