import { useNavigate } from 'react-router-dom'
import { WelcomeHero } from '@/components/WelcomeHero'
import { ROUTES } from '@/router/routes'

export function HomePage() {
  const navigate = useNavigate()

  return (
    <WelcomeHero onNavigateAway={() => navigate(ROUTES.DASHBOARD)} />
  )
}
