import { lazy, Suspense } from 'react'
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom'
import { MainLayout } from '@/layouts/MainLayout'
import { PageLoader } from '@/components/PageLoader'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { ROUTES } from './routes'

// Lazy load pages for code splitting
const HomePage = lazy(() => import('@/pages/HomePage').then((m) => ({ default: m.HomePage })))
const DashboardPage = lazy(() =>
  import('@/pages/DashboardPage').then((m) => ({ default: m.DashboardPage }))
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
            <HomePage />
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
      // Catch all - redirect to dashboard
      {
        path: '*',
        element: <Navigate to={ROUTES.DASHBOARD} replace />,
      },
    ],
  },
])

export function AppRouter() {
  return <RouterProvider router={router} />
}

export { ROUTES } from './routes'
