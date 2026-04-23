import * as React from "react"
import * as ReactDOM from "react-dom"
import { cn } from "@/lib/utils"

interface TooltipProps {
  content: string
  children: React.ReactNode
  className?: string
  align?: "center" | "left" | "right"
}

export function Tooltip({ content, children, className }: TooltipProps) {
  const [coords, setCoords] = React.useState<{ top: number; left: number } | null>(null)
  const triggerRef = React.useRef<HTMLDivElement>(null)

  const show = () => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    setCoords({
      top: rect.top + window.scrollY - 8,
      left: rect.left + window.scrollX + rect.width / 2,
    })
  }

  const hide = () => setCoords(null)

  return (
    <div className="relative inline-block" ref={triggerRef}>
      <div
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        {children}
      </div>
      {coords &&
        ReactDOM.createPortal(
          <div
            role="tooltip"
            style={{
              position: "absolute",
              top: coords.top,
              left: coords.left,
              transform: "translate(-50%, -100%)",
              pointerEvents: "none",
            }}
            className={cn(
              "z-[9999] px-3 py-2 text-xs text-white bg-slate-900 dark:bg-slate-700 rounded-md shadow-lg w-max max-w-xs",
              "after:content-[''] after:absolute after:top-full after:left-1/2 after:-translate-x-1/2",
              "after:border-4 after:border-transparent after:border-t-slate-900 dark:after:border-t-slate-700",
              className
            )}
          >
            {content}
          </div>,
          document.body
        )}
    </div>
  )
}

interface TooltipIconProps {
  content: string
  className?: string
}

export function TooltipIcon({ content, className }: TooltipIconProps) {
  return (
    <Tooltip content={content} className={className}>
      <span className="inline-flex items-center justify-center w-4 h-4 text-xs rounded-full bg-muted text-muted-foreground hover:bg-muted-foreground hover:text-background cursor-help transition-colors">
        ?
      </span>
    </Tooltip>
  )
}