import { useEffect, useRef, useCallback } from 'react'
import type {
  Node,
  Connection,
  EnhancedParticle,
  EnergyWave,
  Point,
  EnhancedConstellationConfig,
  MouseState,
} from './constellation.types'
import { INTERACTION, COLORS, PARALLAX_CONFIG } from './constellation.types'
import { RippleSystem, createRippleSystem } from './effects/RippleSystem'

interface AnimationState {
  particles: EnhancedParticle[]
  waves: EnergyWave[]
  parallaxOffset: Point
  time: number
  lastWaveTime: number
  waveCounter: number
}

// Output ref for DOM nodes to read positions without re-renders
export interface AnimationOutput {
  nodeOffsets: Map<string, Point>
  bezierOffsets: Map<string, { cp1: Point; cp2: Point }>
  parallaxOffset: Point
  time: number
}

interface UseConstellationAnimationProps {
  canvasRef: React.RefObject<HTMLCanvasElement>
  centerNode: Node
  satelliteNodes: Node[]
  connections: Connection[]
  config: EnhancedConstellationConfig
  mouseState: MouseState
  isVisible: boolean
  reducedMotion: boolean
  dimensions: { width: number; height: number }
  outputRef: React.MutableRefObject<AnimationOutput>
}

export function useConstellationAnimation({
  canvasRef,
  centerNode,
  satelliteNodes,
  connections,
  config,
  mouseState,
  isVisible,
  reducedMotion,
  dimensions,
  outputRef,
}: UseConstellationAnimationProps) {
  const stateRef = useRef<AnimationState>({
    particles: [],
    waves: [],
    parallaxOffset: { x: 0, y: 0 },
    time: 0,
    lastWaveTime: 0,
    waveCounter: 0,
  })

  const rippleSystemRef = useRef<RippleSystem | null>(null)
  const frameRef = useRef<number>(0)
  const lastTimeRef = useRef<number>(0)

  // Initialize ripple system when dimensions change
  useEffect(() => {
    if (dimensions.width === 0 || dimensions.height === 0) return

    if (config.enableRipples) {
      rippleSystemRef.current = createRippleSystem(dimensions.width, dimensions.height, {
        defaultDuration: 1200,
        defaultStrength: 2.5,
        maxRipples: 4,
      })
    }
  }, [dimensions.width, dimensions.height, config.enableRipples])

  // Initialize connection particles
  useEffect(() => {
    if (connections.length === 0) return

    const particles: EnhancedParticle[] = []
    const particlesPerConnection = Math.ceil(config.particleCount / connections.length)

    connections.forEach((connection, connIndex) => {
      for (let i = 0; i < particlesPerConnection; i++) {
        particles.push({
          id: connIndex * particlesPerConnection + i,
          connectionId: connection.id,
          progress: Math.random(),
          speed: config.particleSpeed * (0.8 + Math.random() * 0.4),
          size: 2 + Math.random() * 2,
          opacity: 0.4 + Math.random() * 0.4,
          color: Math.random() > 0.5 ? 'lime' : 'cyan',
          trail: [],
          glowIntensity: 0.5 + Math.random() * 0.5,
        })
      }
    })

    stateRef.current.particles = particles
  }, [connections, config.particleCount, config.particleSpeed])

  // Handle click for ripples
  const handleClick = useCallback((event: MouseEvent) => {
    if (!rippleSystemRef.current || !canvasRef.current || !config.enableRipples) return

    const rect = canvasRef.current.getBoundingClientRect()
    rippleSystemRef.current.spawnFromClick(event, rect)
  }, [config.enableRipples, canvasRef])

  // Attach click listener
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !config.enableRipples) return

    canvas.addEventListener('click', handleClick)
    return () => canvas.removeEventListener('click', handleClick)
  }, [canvasRef, handleClick, config.enableRipples])

  // Get point on bezier curve
  const getPointOnBezier = useCallback((
    from: Point,
    to: Point,
    cp1: Point,
    cp2: Point,
    t: number
  ): Point => {
    const t2 = t * t
    const t3 = t2 * t
    const mt = 1 - t
    const mt2 = mt * mt
    const mt3 = mt2 * mt

    return {
      x: mt3 * from.x + 3 * mt2 * t * cp1.x + 3 * mt * t2 * cp2.x + t3 * to.x,
      y: mt3 * from.y + 3 * mt2 * t * cp1.y + 3 * mt * t2 * cp2.y + t3 * to.y,
    }
  }, [])

  // Calculate base bezier control points (without magnetic influence)
  const calculateBaseBezierControlPoints = useCallback((
    from: Point,
    to: Point
  ): { cp1: Point; cp2: Point } => {
    const dx = to.x - from.x
    const dy = to.y - from.y

    const perpX = -dy * 0.15
    const perpY = dx * 0.15

    const cp1: Point = {
      x: from.x + dx * 0.33 + perpX,
      y: from.y + dy * 0.33 + perpY,
    }

    const cp2: Point = {
      x: from.x + dx * 0.67 - perpX,
      y: from.y + dy * 0.67 - perpY,
    }

    return { cp1, cp2 }
  }, [])


  // Main draw function
  const draw = useCallback((ctx: CanvasRenderingContext2D, deltaTime: number) => {
    const canvas = canvasRef.current
    if (!canvas) return

    const { width, height } = canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1

    ctx.clearRect(0, 0, width * dpr, height * dpr)
    ctx.save()
    ctx.scale(dpr, dpr)

    const state = stateRef.current
    const connectionMap = new Map(connections.map(c => [c.id, c]))
    const currentTime = performance.now()

    // Update output ref for DOM nodes
    outputRef.current.parallaxOffset = { ...state.parallaxOffset }
    outputRef.current.time = state.time

    // Calculate bezier control points
    const bezierOffsets = new Map<string, { cp1: Point; cp2: Point }>()
    connections.forEach(conn => {
      bezierOffsets.set(conn.id, calculateBaseBezierControlPoints(conn.from, conn.to))
    })
    outputRef.current.bezierOffsets = bezierOffsets

    // ==================== LAYER 1: ENERGY WAVES ====================
    if (config.enableEnergyWaves && centerNode) {
      if (state.time - state.lastWaveTime > config.waveInterval) {
        state.waves.push({
          id: state.waveCounter++,
          radius: 0,
          maxRadius: config.orbitRadius * 1.8,
          opacity: 0.4,
          startTime: state.time,
        })
        state.lastWaveTime = state.time
      }

      const centerX = centerNode.x + state.parallaxOffset.x * PARALLAX_CONFIG.mid
      const centerY = centerNode.y + state.parallaxOffset.y * PARALLAX_CONFIG.mid

      state.waves = state.waves.filter(wave => {
        const age = state.time - wave.startTime
        const duration = 2000
        const progress = Math.min(1, age / duration)

        const easedProgress = 1 - Math.pow(1 - progress, 3)

        wave.radius = easedProgress * wave.maxRadius
        wave.opacity = 0.4 * (1 - easedProgress)

        if (wave.opacity < 0.01) return false

        const gradient = ctx.createRadialGradient(
          centerX, centerY, wave.radius * 0.8,
          centerX, centerY, wave.radius
        )
        gradient.addColorStop(0, `rgba(${COLORS.limeRgb}, 0)`)
        gradient.addColorStop(0.5, `rgba(${COLORS.limeRgb}, ${wave.opacity})`)
        gradient.addColorStop(1, `rgba(${COLORS.cyanRgb}, 0)`)

        ctx.beginPath()
        ctx.arc(centerX, centerY, wave.radius, 0, Math.PI * 2)
        ctx.strokeStyle = gradient
        ctx.lineWidth = 3
        ctx.stroke()

        return true
      })
    }

    // ==================== LAYER 2: CONNECTION PARTICLES ====================
    state.particles.forEach(particle => {
      const connection = connectionMap.get(particle.connectionId)
      if (!connection) return

      // Check if mouse is near this connection for speed boost
      let speedMultiplier = 1
      if (mouseState.position) {
        const midX = (connection.from.x + connection.to.x) / 2
        const midY = (connection.from.y + connection.to.y) / 2
        const distToMouse = Math.sqrt(
          (mouseState.position.x - midX) ** 2 +
          (mouseState.position.y - midY) ** 2
        )
        if (distToMouse < INTERACTION.PARTICLE_BOOST_RADIUS) {
          const proximity = 1 - distToMouse / INTERACTION.PARTICLE_BOOST_RADIUS
          speedMultiplier = 1 + proximity * 2 // Up to 3x speed when very close
        }
      }

      const speed = particle.speed * speedMultiplier
      particle.progress += speed * (deltaTime / 16)

      if (particle.progress >= 1) {
        particle.progress = 0
        particle.opacity = 0.4 + Math.random() * 0.4
      }

      const bezierData = bezierOffsets.get(connection.id)
      const cp1 = bezierData?.cp1 || connection.from
      const cp2 = bezierData?.cp2 || connection.to

      const pos = getPointOnBezier(connection.from, connection.to, cp1, cp2, particle.progress)

      // Fade in/out at ends
      let opacity = particle.opacity
      if (particle.progress < 0.1) {
        opacity *= particle.progress / 0.1
      } else if (particle.progress > 0.9) {
        opacity *= (1 - particle.progress) / 0.1
      }

      const color = particle.color === 'lime' ? COLORS.limeRgb : COLORS.cyanRgb

      // Outer glow
      ctx.beginPath()
      ctx.arc(pos.x, pos.y, particle.size * 3, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(${color}, ${opacity * 0.15})`
      ctx.fill()

      // Middle glow
      ctx.beginPath()
      ctx.arc(pos.x, pos.y, particle.size * 2, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(${color}, ${opacity * 0.3})`
      ctx.fill()

      // Core
      ctx.beginPath()
      ctx.arc(pos.x, pos.y, particle.size, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(${color}, ${opacity})`
      ctx.fill()

      // Bright center
      ctx.beginPath()
      ctx.arc(pos.x, pos.y, particle.size * 0.5, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(255, 255, 255, ${opacity * 0.8})`
      ctx.fill()
    })

    // ==================== LAYER 3: RIPPLES ====================
    if (config.enableRipples && rippleSystemRef.current) {
      rippleSystemRef.current.render(ctx, currentTime)
    }

    ctx.restore()
  }, [
    canvasRef,
    connections,
    config,
    centerNode,
    mouseState,
    calculateBaseBezierControlPoints,
    getPointOnBezier,
    outputRef,
  ])

  // Animation loop
  useEffect(() => {
    if (!canvasRef.current || !isVisible || reducedMotion) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const setupCanvas = () => {
      const rect = canvas.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      canvas.width = rect.width * dpr
      canvas.height = rect.height * dpr
      canvas.style.width = `${rect.width}px`
      canvas.style.height = `${rect.height}px`
    }

    setupCanvas()
    window.addEventListener('resize', setupCanvas)

    const animate = (currentTime: number) => {
      if (!lastTimeRef.current) lastTimeRef.current = currentTime
      const deltaTime = Math.min(currentTime - lastTimeRef.current, 50)
      lastTimeRef.current = currentTime

      stateRef.current.time += deltaTime

      draw(ctx, deltaTime)

      frameRef.current = requestAnimationFrame(animate)
    }

    frameRef.current = requestAnimationFrame(animate)

    return () => {
      window.removeEventListener('resize', setupCanvas)
      cancelAnimationFrame(frameRef.current)
    }
  }, [canvasRef, isVisible, reducedMotion, draw])

  return {
    time: stateRef.current.time,
    parallaxOffset: stateRef.current.parallaxOffset,
    getBezierControlPoints: calculateBaseBezierControlPoints,
    spawnRipple: (position: Point) => rippleSystemRef.current?.spawn(position),
  }
}

// Helper to initialize constellation nodes
export function initializeConstellation(
  config: EnhancedConstellationConfig,
  center: Point
): {
  centerNode: Node
  satelliteNodes: Node[]
  connections: Connection[]
} {
  const centerNode: Node = {
    id: 'safe-center',
    x: center.x,
    y: center.y,
    size: config.centerSize,
    type: 'center',
  }

  const satelliteNodes: Node[] = []
  const angleStep = (2 * Math.PI) / config.nodeCount

  for (let i = 0; i < config.nodeCount; i++) {
    const angle = angleStep * i - Math.PI / 2
    const x = center.x + Math.cos(angle) * config.orbitRadius
    const y = center.y + Math.sin(angle) * config.orbitRadius

    satelliteNodes.push({
      id: `sub-${i}`,
      x,
      y,
      size: config.satelliteSize,
      type: 'satellite',
      angle,
      orbitRadius: config.orbitRadius,
      floatOffset: i * 0.5,
    })
  }

  const connections: Connection[] = satelliteNodes.map((satellite, i) => ({
    id: `conn-${i}`,
    from: { x: centerNode.x, y: centerNode.y },
    to: { x: satellite.x, y: satellite.y },
    fromNodeId: centerNode.id,
    toNodeId: satellite.id,
  }))

  return { centerNode, satelliteNodes, connections }
}

// Calculate dynamic glow intensity based on mouse distance
export function calculateGlowIntensity(nodePos: Point, mousePos: Point | null, maxRadius: number): number {
  if (!mousePos) return 0
  const distance = Math.sqrt((mousePos.x - nodePos.x) ** 2 + (mousePos.y - nodePos.y) ** 2)
  if (distance > maxRadius) return 0
  return 1 - distance / maxRadius
}
