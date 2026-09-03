import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react'
import type { EventPlayer, RenderState } from '../../render/EventPlayer'

/** Subscribes to an EventPlayer's render-state stream (via useSyncExternalStore, so React owns
 * the render scheduling instead of a setState-in-effect) and drives its animation clock off
 * requestAnimationFrame. Returns null until a player exists (i.e. before the first simulated game). */
export function useGamePlayback(player: EventPlayer | null): RenderState | null {
  const snapshotRef = useRef<RenderState | null>(null)
  const trackedPlayerRef = useRef<EventPlayer | null>(null)

  const getSnapshot = useCallback((): RenderState | null => {
    if (trackedPlayerRef.current !== player) {
      trackedPlayerRef.current = player
      if (player) {
        const unsubscribe = player.onFrame((state) => {
          snapshotRef.current = state
        })
        unsubscribe()
      } else {
        snapshotRef.current = null
      }
    }
    return snapshotRef.current
  }, [player])

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (!player) return () => {}
      return player.onFrame((state) => {
        snapshotRef.current = state
        onStoreChange()
      })
    },
    [player],
  )

  const renderState = useSyncExternalStore(subscribe, getSnapshot)

  useEffect(() => {
    if (!player) return
    let rafId: number
    let last = performance.now()

    function loop(now: number) {
      const delta = now - last
      last = now
      player!.tick(delta)
      rafId = requestAnimationFrame(loop)
    }

    rafId = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafId)
  }, [player])

  return renderState
}
