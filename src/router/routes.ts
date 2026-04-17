// Route paths constants
export const ROUTES = {
  HOME: '/',
  DASHBOARD: '/dashboard',
  WIZARD: '/wizard',
  CHALLENGE: '/challenge',
} as const

export type RouteKey = keyof typeof ROUTES
export type RoutePath = (typeof ROUTES)[RouteKey]
