import { useRef, useEffect, useState, useCallback, useMemo } from 'react'
import type { TransactionPreviewData, RoleChange, ChangeAction } from '@/types/transactionPreview'
import { ROLES, ROLE_NAMES, ROLE_DESCRIPTIONS } from '@/lib/contracts'
import { CenterNode } from './nodes/CenterNode'
import { RoleNode } from './nodes/RoleNode'
import { SpendingNode } from './nodes/SpendingNode'
import { ProtocolNode } from './nodes/ProtocolNode'
import { ConnectionLine, ConnectionDefs } from './ConnectionLine'

interface PreviewRadialSchemaProps {
  data: TransactionPreviewData
}

// Default roles for display when not available
const DEFAULT_ROLES: RoleChange[] = [
  {
    roleId: ROLES.DEFI_EXECUTE_ROLE,
    roleName: ROLE_NAMES[ROLES.DEFI_EXECUTE_ROLE],
    description: ROLE_DESCRIPTIONS[ROLES.DEFI_EXECUTE_ROLE],
    action: 'unchanged',
  },
  {
    roleId: ROLES.DEFI_TRANSFER_ROLE,
    roleName: ROLE_NAMES[ROLES.DEFI_TRANSFER_ROLE],
    description: ROLE_DESCRIPTIONS[ROLES.DEFI_TRANSFER_ROLE],
    action: 'unchanged',
  },
]

// Layout configuration
const LAYOUT = {
  containerHeight: 420,
}

// Animation timing
const ANIMATION_COMPLETE_DELAY_MS = 600
const RESIZE_DEBOUNCE_MS = 100

export function PreviewRadialSchema({ data }: PreviewRadialSchemaProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const centerNodeRef = useRef<HTMLDivElement>(null)
  const roleRefsMap = useRef<Map<number, HTMLDivElement | null>>(new Map())
  const spendingNodeRef = useRef<HTMLDivElement>(null)
  const spendingContainerRef = useRef<HTMLDivElement>(null)
  const protocolsContainerRef = useRef<HTMLDivElement>(null)

  const [lines, setLines] = useState<
    {
      from: { x: number; y: number }
      to: { x: number; y: number }
      key: string
      action: ChangeAction
      direction: 'top' | 'left' | 'right'
    }[]
  >([])

  // Derive display data from fullState if available, otherwise use partial data
  const displayData = useMemo(() => {
    if (data.fullState) {
      return {
        roles: data.fullState.roles,
        spendingLimits: data.fullState.spendingLimits,
        protocols: data.fullState.protocols,
      }
    }
    return {
      roles: data.roles || DEFAULT_ROLES,
      spendingLimits: data.spendingLimits || null,
      protocols: data.protocols || [],
    }
  }, [data])

  // Filter roles: show only active roles OR roles being added
  const activeRoles = useMemo(
    () => displayData.roles.filter(role => role.isActive || role.action === 'add'),
    [displayData.roles]
  )
  const executeRole = useMemo(
    () => activeRoles.find(role => role.roleId === ROLES.DEFI_EXECUTE_ROLE),
    [activeRoles]
  )
  const topRoles = activeRoles
  const shouldNestProtocolsUnderExecute = Boolean(
    executeRole && displayData.protocols.length > 0 && executeRole.action !== 'unchanged'
  )
  // Helper to get center of an element relative to container
  const getElementCenter = useCallback((element: HTMLElement | null, containerRect: DOMRect) => {
    if (!element) return null
    const rect = element.getBoundingClientRect()
    return {
      x: rect.left + rect.width / 2 - containerRect.left,
      y: rect.top + rect.height / 2 - containerRect.top,
    }
  }, [])

  // Calculate connection lines after layout
  const calculateLines = useCallback(() => {
    if (!containerRef.current || !centerNodeRef.current) return

    const containerRect = containerRef.current.getBoundingClientRect()
    const center = getElementCenter(centerNodeRef.current, containerRect)
    if (!center) return

    const newLines: typeof lines = []

    // Lines to top roles
    topRoles.forEach(role => {
      const roleRef = roleRefsMap.current.get(role.roleId)
      if (roleRef) {
        const to = getElementCenter(roleRef, containerRect)
        if (to) {
          newLines.push({ key: `role-${role.roleId}`, from: center, to, action: role.action, direction: 'top' })
        }
      }
    })

    // Line to Protocols
    if (protocolsContainerRef.current && displayData.protocols.length > 0) {
      const rect = protocolsContainerRef.current.getBoundingClientRect()
      // Determine dominant protocol action
      const additions = displayData.protocols.reduce(
        (sum, p) => sum + p.contracts.filter(c => c.action === 'add').length,
        0
      )
      const removals = displayData.protocols.reduce(
        (sum, p) => sum + p.contracts.filter(c => c.action === 'remove').length,
        0
      )
      const protocolAction: ChangeAction = additions > removals ? 'add' : removals > 0 ? 'remove' : 'unchanged'
      const protocolAnchor =
        shouldNestProtocolsUnderExecute && executeRole
          ? getElementCenter(roleRefsMap.current.get(executeRole.roleId), containerRect)
          : center
      const protocolLineAction =
        shouldNestProtocolsUnderExecute && executeRole ? executeRole.action : protocolAction

      if (protocolAnchor) {
        newLines.push({
          key: 'protocols',
          from: protocolAnchor,
          to: {
            x: rect.right - containerRect.left,
            y: rect.top + rect.height / 2 - containerRect.top,
          },
          action: protocolLineAction,
          direction: 'left',
        })
      }
    }

    // Line to Spending (right)
    if (spendingNodeRef.current && displayData.spendingLimits) {
      const to = getElementCenter(spendingNodeRef.current, containerRect)
      if (to) {
        // Determine spending action
        const spendingAction: ChangeAction = !displayData.spendingLimits.before
          ? 'add'
          : displayData.spendingLimits.before.maxSpendingBps !== displayData.spendingLimits.after.maxSpendingBps ||
              displayData.spendingLimits.before.maxSpendingUSD !== displayData.spendingLimits.after.maxSpendingUSD ||
              displayData.spendingLimits.before.mode !== displayData.spendingLimits.after.mode ||
              displayData.spendingLimits.before.windowDuration !== displayData.spendingLimits.after.windowDuration
            ? 'add'
            : 'unchanged'
        newLines.push({ key: 'spending', from: center, to, action: spendingAction, direction: 'right' })
      }
    }

    setLines(newLines)
  }, [displayData, executeRole, getElementCenter, shouldNestProtocolsUnderExecute, topRoles])

  useEffect(() => {
    // Calculate after animations complete
    const timer = setTimeout(calculateLines, ANIMATION_COMPLETE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [calculateLines])

  // Recalculate on resize
  useEffect(() => {
    const handleResize = () => calculateLines()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [calculateLines])

  // Recalculate when protocols container resizes (expand/collapse)
  useEffect(() => {
    if (!protocolsContainerRef.current) return
    let timeoutId: ReturnType<typeof setTimeout>
    const observer = new ResizeObserver(() => {
      clearTimeout(timeoutId)
      timeoutId = setTimeout(calculateLines, RESIZE_DEBOUNCE_MS)
    })
    observer.observe(protocolsContainerRef.current)
    return () => {
      clearTimeout(timeoutId)
      observer.disconnect()
    }
  }, [calculateLines])

  // Recalculate when spending container resizes (content changes)
  useEffect(() => {
    if (!spendingContainerRef.current) return
    let timeoutId: ReturnType<typeof setTimeout>
    const observer = new ResizeObserver(() => {
      clearTimeout(timeoutId)
      timeoutId = setTimeout(calculateLines, RESIZE_DEBOUNCE_MS)
    })
    observer.observe(spendingContainerRef.current)
    return () => {
      clearTimeout(timeoutId)
      observer.disconnect()
    }
  }, [calculateLines])

  return (
    <div
      ref={containerRef}
      className="relative w-full"
      style={{ height: LAYOUT.containerHeight }}
    >
      {/* SVG layer for connection lines */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 0 }}>
        <ConnectionDefs />
        {lines.map((line, idx) => (
          <ConnectionLine
            key={line.key}
            from={line.from}
            to={line.to}
            action={line.action}
            direction={line.direction}
            delay={0.15 + idx * 0.05}
          />
        ))}
      </svg>

      {/* === TOP ROLES === */}
      {topRoles.length > 0 && (
        <div className="absolute top-8 left-0 right-0 flex justify-center gap-40 z-10">
          {topRoles.map((role, idx) => (
            <RoleNode
              key={role.roleId}
              ref={el => {
                roleRefsMap.current.set(role.roleId, el)
              }}
              role={role}
              delay={0.1 + idx * 0.05}
            />
          ))}
        </div>
      )}

      {/* === PROTOCOLS (LEFT OF EXECUTE) === */}
      {displayData.protocols.length > 0 && (
        <div
          ref={protocolsContainerRef}
          className="absolute z-10 flex flex-col gap-3"
          style={{
            left: 28,
            top: '55%',
            transform: 'translateY(-50%)',
            maxWidth: 180,
          }}
        >
          {displayData.protocols.map((protocol, idx) => (
            <ProtocolNode
              key={protocol.protocolId}
              protocol={protocol}
              delay={0.1 + idx * 0.05}
              forceAction={
                shouldNestProtocolsUnderExecute && executeRole && protocol.isActive
                  ? executeRole.action
                  : undefined
              }
            />
          ))}
        </div>
      )}

      {/* === CENTER === */}
      <div
        className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 z-10"
        style={{ top: '52%' }}
      >
        <CenterNode ref={centerNodeRef} address={data.subAccountAddress} />
      </div>

      {/* === SPENDING (RIGHT) === */}
      {displayData.spendingLimits && (
        <div
          ref={spendingContainerRef}
          className="absolute right-10 top-[52%] -translate-y-1/2 z-10"
        >
          <SpendingNode ref={spendingNodeRef} limits={displayData.spendingLimits} delay={0.2} />
        </div>
      )}
    </div>
  )
}
