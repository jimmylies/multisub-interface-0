import { lazy, Suspense } from 'react'
import { createBrowserRouter, RouterProvider, Navigate, useLocation } from 'react-router-dom'
import { MainLayout } from '@/layouts/MainLayout'
import { PageLoader } from '@/components/PageLoader'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { ROUTES } from './routes'

// Lazy load pages for code splitting
const DashboardPage = lazy(() =>
  import('@/pages/DashboardPage').then(m => ({ default: m.DashboardPage }))
)
const WizardPage = lazy(() => import('@/pages/WizardPage').then(m => ({ default: m.WizardPage })))

function LegacyAgentsRedirect() {
  const location = useLocation()

  return (
    <Navigate
      to={`${ROUTES.DASHBOARD}${location.search}`}
      replace
    />
  )
}

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
        element: <Navigate to={ROUTES.DASHBOARD} replace />,
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
            <LegacyAgentsRedirect />
          </LazyPage>
        ),
      },
      {
        path: 'challenge',
        element: <Navigate to={ROUTES.DASHBOARD} replace />,
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
