import { useState, useEffect, useRef, RefObject } from 'react'
import type { MouseState, Point } from './constellation.types'

/**
 * Optimized mouse position hook that tracks mouse globally on the window
 * Position is relative to the container for calculations
 * Attraction works even when mouse is outside the container
 */
export function useMousePosition(containerRef: RefObject<HTMLElement>): MouseState {
  // Use ref for position to avoid re-renders on every mouse move
  const positionRef = useRef<Point | null>(null)
  const [isInside, setIsInside] = useState(false)

  // Return object is memoized and position is accessed via getter
  const stateRef = useRef<MouseState>({
    position: null,
    isInside: false,
  })

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let rafId: number | null = null
    let pendingPosition: { x: number; y: number } | null = null

    // Use requestAnimationFrame for smooth updates
    const updatePosition = () => {
      if (pendingPosition && container) {
        const rect = container.getBoundingClientRect()
        // Convert global mouse position to container-relative coordinates
        positionRef.current = {
          x: pendingPosition.x - rect.left,
          y: pendingPosition.y - rect.top,
        }
        stateRef.current.position = positionRef.current
        pendingPosition = null
      }
      rafId = null
    }

    // Track mouse globally on window
    const handleMouseMove = (e: MouseEvent) => {
      pendingPosition = { x: e.clientX, y: e.clientY }

      // Batch updates to next animation frame
      if (rafId === null) {
        rafId = requestAnimationFrame(updatePosition)
      }
    }

    const handleMouseEnter = () => {
      setIsInside(true)
      stateRef.current.isInside = true
    }

    const handleMouseLeave = () => {
      setIsInside(false)
      stateRef.current.isInside = false
      // Keep tracking position even when outside for global attraction
      // Don't reset positionRef here
    }

    // Track mouse on window for global attraction
    window.addEventListener('mousemove', handleMouseMove, { passive: true })
    // Track enter/leave on container for visual feedback
    container.addEventListener('mouseenter', handleMouseEnter, { passive: true })
    container.addEventListener('mouseleave', handleMouseLeave, { passive: true })

    return () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId)
      }
      window.removeEventListener('mousemove', handleMouseMove)
      container.removeEventListener('mouseenter', handleMouseEnter)
      container.removeEventListener('mouseleave', handleMouseLeave)
    }
  }, [containerRef])

  // Return an object that reads from refs (doesn't cause re-renders on position change)
  return {
    get position() {
      return positionRef.current
    },
    isInside,
  }
}

export function useReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    setPrefersReducedMotion(mediaQuery.matches)

    const handler = (e: MediaQueryListEvent) => {
      setPrefersReducedMotion(e.matches)
    }

    mediaQuery.addEventListener('change', handler)
    return () => mediaQuery.removeEventListener('change', handler)
  }, [])

  return prefersReducedMotion
}

export function useResponsiveConfig(): 'desktop' | 'tablet' | 'mobile' {
  const [breakpoint, setBreakpoint] = useState<'desktop' | 'tablet' | 'mobile'>('desktop')

  useEffect(() => {
    const updateBreakpoint = () => {
      const width = window.innerWidth
      if (width < 768) {
        setBreakpoint('mobile')
      } else if (width < 1024) {
        setBreakpoint('tablet')
      } else {
        setBreakpoint('desktop')
      }
    }

    updateBreakpoint()
    window.addEventListener('resize', updateBreakpoint)
    return () => window.removeEventListener('resize', updateBreakpoint)
  }, [])

  return breakpoint
}
