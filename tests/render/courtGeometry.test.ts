import { describe, expect, it } from 'vitest'
import { lerpPoint, toCanvasXY } from '../../src/render/courtGeometry'

describe('toCanvasXY', () => {
  it('scales court feet to canvas pixels', () => {
    expect(toCanvasXY({ x: 47, y: 25 }, 940, 500, false)).toEqual({ x: 470, y: 250 })
    expect(toCanvasXY({ x: 0, y: 0 }, 940, 500, false)).toEqual({ x: 0, y: 0 })
    expect(toCanvasXY({ x: 94, y: 50 }, 940, 500, false)).toEqual({ x: 940, y: 500 })
  })

  it('mirrors the x-axis (only) when mirror is true', () => {
    expect(toCanvasXY({ x: 10, y: 25 }, 940, 500, true)).toEqual({ x: 840, y: 250 })
    expect(toCanvasXY({ x: 10, y: 25 }, 940, 500, false)).toEqual({ x: 100, y: 250 })
  })
})

describe('lerpPoint', () => {
  it('interpolates linearly and clamps t to [0, 1]', () => {
    expect(lerpPoint({ x: 0, y: 0 }, { x: 10, y: 20 }, 0.5)).toEqual({ x: 5, y: 10 })
    expect(lerpPoint({ x: 0, y: 0 }, { x: 10, y: 20 }, -1)).toEqual({ x: 0, y: 0 })
    expect(lerpPoint({ x: 0, y: 0 }, { x: 10, y: 20 }, 2)).toEqual({ x: 10, y: 20 })
  })
})
