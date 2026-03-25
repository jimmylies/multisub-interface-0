import { lazy, Suspense } from 'react'
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom'
import { MainLayout } from '@/layouts/MainLayout'
import { PageLoader } from '@/components/PageLoader'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { ROUTES } from './routes'

// Lazy load pages for code splitting
const HomePage = lazy(() => import('@/pages/HomePage').then(m => ({ default: m.HomePage })))
const DashboardPage = lazy(() =>
  import('@/pages/DashboardPage').then(m => ({ default: m.DashboardPage }))
)
const WizardPage = lazy(() => import('@/pages/WizardPage').then(m => ({ default: m.WizardPage })))
const AgentsPage = lazy(() => import('@/pages/AgentsPage').then(m => ({ default: m.AgentsPage })))
const ChallengePage = lazy(() =>
  import('@/pages/ChallengePage').then(m => ({ default: m.ChallengePage }))
)

// Wrapper with ErrorBoundary and Suspense for lazy loaded pages
function LazyPage({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary>
      <Suspense fallback={<PageLoader />}>{children}</Suspense>
    </ErrorBoundary>
  )
}

const router = createBrowserRouter([
  {
    path: '/',
    element: <MainLayout />,
    children: [
      {
        index: true,
        element: (
          <LazyPage>
            <ChallengePage />
          </LazyPage>
        ),
      },
      {
        path: 'dashboard',
        element: (
          <LazyPage>
            <DashboardPage />
          </LazyPage>
        ),
      },
      {
        path: 'wizard',
        element: (
          <LazyPage>
            <WizardPage />
          </LazyPage>
        ),
      },
      {
        path: 'agents',
        element: (
          <LazyPage>
            <AgentsPage />
          </LazyPage>
        ),
      },
      {
        path: 'challenge',
        element: (
          <LazyPage>
            <ChallengePage />
          </LazyPage>
        ),
      },
      // Catch all - redirect to home
      {
        path: '*',
        element: (
          <Navigate
            to={ROUTES.HOME}
            replace
          />
        ),
      },
    ],
  },
])

export function AppRouter() {
  return <RouterProvider router={router} />
}

export { ROUTES } from './routes'
