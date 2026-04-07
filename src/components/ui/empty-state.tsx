import * as React from 'react'
import { LucideIcon, Inbox, Search, FileQuestion, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from './button'
import { FadeInUp } from './motion'

type EmptyStateVariant = 'default' | 'search' | 'error' | 'no-data'

interface EmptyStateAction {
  label: string
  onClick: () => void
  variant?: 'default' | 'secondary' | 'outline' | 'ghost'
}

interface EmptyStateProps {
  /** Title of the empty state */
  title: string
  /** Description text */
  description?: string
  /** Custom icon (defaults to variant icon) */
  icon?: LucideIcon
  /** Visual variant that determines the default icon */
  variant?: EmptyStateVariant
  /** Primary action button */
  action?: EmptyStateAction
  /** Secondary action button */
  secondaryAction?: EmptyStateAction
  /** Additional content to render */
  children?: React.ReactNode
  /** Custom class name */
  className?: string
  /** Size of the empty state */
  size?: 'sm' | 'md' | 'lg'
}

const variantIcons: Record<EmptyStateVariant, LucideIcon> = {
  default: Inbox,
  search: Search,
  error: AlertCircle,
  'no-data': FileQuestion,
}

const sizeClasses = {
  sm: {
    container: 'py-8',
    iconWrapper: 'p-3 mb-3',
    icon: 'w-6 h-6',
    title: 'text-base',
    description: 'text-sm',
  },
  md: {
    container: 'py-12',
    iconWrapper: 'p-4 mb-4',
    icon: 'w-8 h-8',
    title: 'text-lg',
    description: 'text-sm',
  },
  lg: {
    container: 'py-16',
    iconWrapper: 'p-5 mb-5',
    icon: 'w-10 h-10',
    title: 'text-xl',
    description: 'text-base',
  },
}

export function EmptyState({
  title,
  description,
  icon,
  variant = 'default',
  action,
  secondaryAction,
  children,
  className,
  size = 'md',
}: EmptyStateProps) {
  const Icon = icon || variantIcons[variant]
  const sizes = sizeClasses[size]

  return (
    <FadeInUp
      className={cn(
        'flex flex-col items-center justify-center text-center',
        sizes.container,
        className
      )}
    >
      <div className={cn('rounded-full bg-elevated-2', sizes.iconWrapper)}>
        <Icon
          className={cn(sizes.icon, 'text-tertiary')}
          aria-hidden="true"
        />
      </div>

      <h3 className={cn('font-medium text-primary mb-2', sizes.title)}>{title}</h3>

      {description && (
        <p className={cn('text-secondary max-w-md mb-4', sizes.description)}>{description}</p>
      )}

      {children}

      {(action || secondaryAction) && (
        <div className="flex items-center gap-3 mt-4">
          {secondaryAction && (
            <Button
              variant={secondaryAction.variant || 'outline'}
              size="sm"
              onClick={secondaryAction.onClick}
            >
              {secondaryAction.label}
            </Button>
          )}
          {action && (
            <Button
              variant={action.variant || 'default'}
              size="sm"
              onClick={action.onClick}
            >
              {action.label}
            </Button>
          )}
        </div>
      )}
    </FadeInUp>
  )
}
