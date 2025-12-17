export interface Point {
  x: number
  y: number
}

export interface Node extends Point {
  id: string
  size: number
  type: 'center' | 'satellite'
  angle?: number // For satellites - position on orbit
  orbitRadius?: number
  floatOffset?: number // For floating animation phase
}

// Enhanced node with magnetic field and bloom effects
export interface EnhancedNode extends Node {
  magneticOffset: Point // Offset due to cursor magnetic field
  bloomState: number // 0-1, 0=normal, 1=full bloom
  label?: string
  baseX: number // Original position before magnetic offset
  baseY: number
}

export interface Connection {
  id: string
  from: Point
  to: Point
  fromNodeId: string
  toNodeId: string
}

// Bezier connection with dynamic control points
export interface BezierConnection extends Connection {
  controlPoint1: Point
  controlPoint2: Point
  // Animated control points
  targetCP1: Point
  targetCP2: Point
}

export interface Particle {
  id: number
  connectionId: string
  progress: number // 0-1 along the connection
  speed: number
  size: number
  opacity: number
  color: 'lime' | 'cyan'
}

// Enhanced particle with trail
export interface EnhancedParticle extends Particle {
  trail: Point[] // Position history for trail effect
  glowIntensity: number
}

// Star for background starfield
export interface Star {
  id: number
  x: number
  y: number
  size: number
  baseOpacity: number
  opacity: number
  twinkleSpeed: number
  twinklePhase: number
  layer: 'far' | 'mid' // Parallax layer
}

// Energy wave ripple from center
export interface EnergyWave {
  id: number
  radius: number
  maxRadius: number
  opacity: number
  startTime: number
}

// Parallax state for 3D depth effect
export interface ParallaxState {
  offset: Point // Current offset
  targetOffset: Point // Target (follows mouse)
}

export interface ParallaxConfig {
  far: number // Multiplier 0.05
  mid: number // Multiplier 0.15
  near: number // Multiplier 0.25
  lerpFactor: number // Smoothness
}

// Magnetic field influence
export interface MagneticField {
  strength: number // 0-1 based on distance
  direction: Point // Normalized vector
  radius: number
}

export interface ConstellationConfig {
  nodeCount: number
  particleCount: number
  centerSize: number
  satelliteSize: number
  orbitRadius: number
  particleSpeed: number
  enableInteraction: boolean
}

// Extended config for enhanced constellation
export interface EnhancedConstellationConfig extends ConstellationConfig {
  starCount: number
  enableParallax: boolean
  enableMagneticField: boolean
  enableEnergyWaves: boolean
  enableParticleTrails: boolean
  enableNodeBloom: boolean
  waveInterval: number // ms between waves
  trailLength: number
  enableRipples: boolean
  enableEnergyCurrents: boolean
}

export interface ConstellationState {
  centerNode: Node
  satelliteNodes: Node[]
  connections: Connection[]
  particles: Particle[]
  dimensions: { width: number; height: number }
  isVisible: boolean
  time: number
}

export interface MouseState {
  position: Point | null
  isInside: boolean
}

export const DEFAULT_CONFIG: ConstellationConfig = {
  nodeCount: 5,
  particleCount: 30,
  centerSize: 80,
  satelliteSize: 40,
  orbitRadius: 160,
  particleSpeed: 0.003,
  enableInteraction: true,
}

export const RESPONSIVE_CONFIGS: Record<'desktop' | 'tablet' | 'mobile', Partial<ConstellationConfig>> = {
  desktop: {
    nodeCount: 5,
    particleCount: 30,
    orbitRadius: 160,
  },
  tablet: {
    nodeCount: 4,
    particleCount: 20,
    orbitRadius: 130,
  },
  mobile: {
    nodeCount: 3,
    particleCount: 12,
    orbitRadius: 90,
  },
}

export const INTERACTION = {
  NODE_HIGHLIGHT_RADIUS: 150,
  PARTICLE_BOOST_RADIUS: 100,
  GLOW_INTENSITY_RADIUS: 200,
} as const

export const COLORS = {
  lime: '#12FF80',
  cyan: '#00D4FF',
  limeRgb: '18, 255, 128',
  cyanRgb: '0, 212, 255',
} as const

// Enhanced constellation config
export const ENHANCED_DEFAULT_CONFIG: EnhancedConstellationConfig = {
  ...DEFAULT_CONFIG,
  starCount: 50,
  enableParallax: false,
  enableMagneticField: false,
  enableEnergyWaves: true,
  enableParticleTrails: false,
  enableNodeBloom: false,
  waveInterval: 3000,
  trailLength: 6,
  enableRipples: true,
  enableEnergyCurrents: true,
}

// Responsive configs for enhanced features
export const ENHANCED_RESPONSIVE_CONFIGS: Record<'desktop' | 'tablet' | 'mobile', Partial<EnhancedConstellationConfig>> = {
  desktop: {
    starCount: 50,
    trailLength: 6,
    enableParallax: false,
    enableMagneticField: false,
    enableEnergyWaves: true,
    enableRipples: true,
    enableEnergyCurrents: true,
  },
  tablet: {
    starCount: 30,
    trailLength: 5,
    enableParallax: false,
    enableMagneticField: false,
    enableEnergyWaves: true,
    enableRipples: true,
    enableEnergyCurrents: true,
  },
  mobile: {
    starCount: 15,
    trailLength: 3,
    enableParallax: false,
    enableMagneticField: false,
    enableEnergyWaves: false,
    enableRipples: true,
    enableEnergyCurrents: false,
  },
}

// Parallax configuration
export const PARALLAX_CONFIG: ParallaxConfig = {
  far: 0.03,   // Stars - subtle movement
  mid: 0.08,   // Nodes & connections
  near: 0.15,  // Particles - more pronounced
  lerpFactor: 0.06, // Smoothness (lower = smoother)
}

// Magnetic field configuration
export const MAGNETIC_CONFIG = {
  nodeAttractionRadius: 150,
  nodeAttractionStrength: 15, // Max pixels displacement
  particleDeflectionRadius: 80,
  bezierInfluenceRadius: 120,
  bezierInfluenceStrength: 40, // Max control point displacement
} as const
