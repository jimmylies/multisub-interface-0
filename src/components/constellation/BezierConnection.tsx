import { memo, useRef, useMemo } from 'react'
import type { Connection, Point } from './constellation.types'
import { MAGNETIC_CONFIG, COLORS } from './constellation.types'

interface BezierConnectionProps {
  connection: Connection
  mousePos: Point | null
  parallaxOffset: Point
  enableMagnetic?: boolean
  enableEnergyCurrents?: boolean
  time?: number
  // Pre-calculated bezier offsets from animation loop
  bezierOffset?: { cp1: Point; cp2: Point }
}

// Generate energy current path with wave offset
function generateEnergyCurrentPath(
  from: Point,
  to: Point,
  cp1: Point,
  cp2: Point,
  time: number,
  streamIndex: number,
  totalStreams: number
): string {
  const segments = 30
  const points: Point[] = []

  for (let i = 0; i <= segments; i++) {
    const t = i / segments
    // Cubic bezier calculation
    const t2 = t * t
    const t3 = t2 * t
    const mt = 1 - t
    const mt2 = mt * mt
    const mt3 = mt2 * mt

    const baseX = mt3 * from.x + 3 * mt2 * t * cp1.x + 3 * mt * t2 * cp2.x + t3 * to.x
    const baseY = mt3 * from.y + 3 * mt2 * t * cp1.y + 3 * mt * t2 * cp2.y + t3 * to.y

    // Calculate tangent for perpendicular offset
    const tangentX = 3 * mt2 * (cp1.x - from.x) +
                     6 * mt * t * (cp2.x - cp1.x) +
                     3 * t2 * (to.x - cp2.x)
    const tangentY = 3 * mt2 * (cp1.y - from.y) +
                     6 * mt * t * (cp2.y - cp1.y) +
                     3 * t2 * (to.y - cp2.y)

    const tangentLength = Math.sqrt(tangentX * tangentX + tangentY * tangentY) || 1
    const perpX = -tangentY / tangentLength
    const perpY = tangentX / tangentLength

    // Wave calculation - wider in middle, narrow at ends
    const widthFactor = Math.sin(t * Math.PI) // 0 at ends, 1 in middle
    const wavePhase = t * 8 + (time * 0.002) + (streamIndex * Math.PI / totalStreams)
    const waveAmplitude = 5 * widthFactor * (0.6 + streamIndex * 0.15)
    const wave = Math.sin(wavePhase) * waveAmplitude

    // Stream offset (spread streams perpendicular to curve)
    const streamOffset = (streamIndex - (totalStreams - 1) / 2) * 3

    points.push({
      x: baseX + perpX * (wave + streamOffset),
      y: baseY + perpY * (wave + streamOffset),
    })
  }

  // Build path string
  let path = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`
  for (let i = 1; i < points.length; i++) {
    path += ` L ${points[i].x.toFixed(1)} ${points[i].y.toFixed(1)}`
  }

  return path
}

// Memoized component to prevent unnecessary re-renders
export const BezierConnection = memo(function BezierConnection({
  connection,
  mousePos,
  parallaxOffset,
  enableMagnetic = false,
  enableEnergyCurrents = true,
  time = 0,
  bezierOffset,
}: BezierConnectionProps) {
  const lastPathRef = useRef<string>('')
  const lastHighlightRef = useRef<boolean>(false)

  const { from, to } = connection

  // Apply parallax to from/to
  const parallaxedFrom = {
    x: from.x + parallaxOffset.x * 0.08,
    y: from.y + parallaxOffset.y * 0.08,
  }
  const parallaxedTo = {
    x: to.x + parallaxOffset.x * 0.08,
    y: to.y + parallaxOffset.y * 0.08,
  }

  const dx = parallaxedTo.x - parallaxedFrom.x
  const dy = parallaxedTo.y - parallaxedFrom.y

  // Add natural curve (perpendicular offset)
  const perpX = -dy * 0.12
  const perpY = dx * 0.12

  let cp1x = parallaxedFrom.x + dx * 0.33 + perpX
  let cp1y = parallaxedFrom.y + dy * 0.33 + perpY
  let cp2x = parallaxedFrom.x + dx * 0.67 - perpX
  let cp2y = parallaxedFrom.y + dy * 0.67 - perpY

  // Use pre-calculated bezier offset if available, otherwise calculate
  if (bezierOffset) {
    cp1x = bezierOffset.cp1.x
    cp1y = bezierOffset.cp1.y
    cp2x = bezierOffset.cp2.x
    cp2y = bezierOffset.cp2.y
  } else if (mousePos && enableMagnetic) {
    const calcMagneticOffset = (cpx: number, cpy: number): { x: number; y: number } => {
      const mdx = mousePos.x - cpx
      const mdy = mousePos.y - cpy
      const distance = Math.sqrt(mdx * mdx + mdy * mdy)

      if (distance > MAGNETIC_CONFIG.bezierInfluenceRadius) return { x: 0, y: 0 }

      const normalizedDistance = distance / MAGNETIC_CONFIG.bezierInfluenceRadius
      const influenceFactor = (1 - normalizedDistance) * (1 - normalizedDistance)
      const dirX = mdx / (distance || 1)
      const dirY = mdy / (distance || 1)

      return {
        x: dirX * MAGNETIC_CONFIG.bezierInfluenceStrength * influenceFactor,
        y: dirY * MAGNETIC_CONFIG.bezierInfluenceStrength * influenceFactor,
      }
    }

    const offset1 = calcMagneticOffset(cp1x, cp1y)
    const offset2 = calcMagneticOffset(cp2x, cp2y)

    cp1x += offset1.x
    cp1y += offset1.y
    cp2x += offset2.x
    cp2y += offset2.y
  }

  // Calculate if mouse is near for highlighting
  let isHighlighted = false
  if (mousePos) {
    const midX = (parallaxedFrom.x + parallaxedTo.x) / 2
    const midY = (parallaxedFrom.y + parallaxedTo.y) / 2
    const distToMidSq = (mousePos.x - midX) ** 2 + (mousePos.y - midY) ** 2
    isHighlighted = distToMidSq < 10000 // 100^2
  }

  const cp1 = { x: cp1x, y: cp1y }
  const cp2 = { x: cp2x, y: cp2y }

  const path = `M ${parallaxedFrom.x.toFixed(1)} ${parallaxedFrom.y.toFixed(1)} C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${parallaxedTo.x.toFixed(1)} ${parallaxedTo.y.toFixed(1)}`

  // Generate energy current paths (memoized based on time changes)
  const energyCurrents = useMemo(() => {
    if (!enableEnergyCurrents) return []

    const streamCount = 3
    const streams: Array<{ path: string; opacity: number; width: number; color: string }> = []

    for (let i = 0; i < streamCount; i++) {
      streams.push({
        path: generateEnergyCurrentPath(
          parallaxedFrom,
          parallaxedTo,
          cp1,
          cp2,
          time,
          i,
          streamCount
        ),
        opacity: 0.15 - i * 0.03,
        width: 1.5 - i * 0.3,
        color: i % 2 === 0 ? COLORS.lime : COLORS.cyan,
      })
    }

    return streams
  }, [parallaxedFrom.x, parallaxedFrom.y, parallaxedTo.x, parallaxedTo.y, cp1.x, cp1.y, cp2.x, cp2.y, time, enableEnergyCurrents])

  lastPathRef.current = path
  lastHighlightRef.current = isHighlighted

  return (
    <g className="bezier-connection" style={{ willChange: 'transform' }}>
      {/* Glow layer (behind) - only render when highlighted for performance */}
      {isHighlighted && (
        <path
          d={path}
          fill="none"
          stroke="url(#connectionGradient)"
          strokeWidth={6}
          strokeOpacity={0.25}
          style={{ filter: 'blur(3px)' }}
        />
      )}

      {/* Energy currents - flowing wave effect */}
      {enableEnergyCurrents && energyCurrents.map((stream, idx) => (
        <path
          key={`energy-${idx}`}
          d={stream.path}
          fill="none"
          stroke={stream.color}
          strokeWidth={stream.width}
          strokeOpacity={stream.opacity * (isHighlighted ? 1.8 : 1)}
          strokeLinecap="round"
        />
      ))}

      {/* Main line */}
      <path
        d={path}
        fill="none"
        stroke="url(#connectionGradient)"
        strokeWidth={isHighlighted ? 2 : 1.5}
        strokeDasharray="8 6"
        className="connection-line"
        style={{
          willChange: 'stroke-width',
        }}
      />
    </g>
  )
})

export default BezierConnection
