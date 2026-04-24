import * as React from "react"
import * as ReactDOM from "react-dom"
import { cn } from "@/lib/utils"

interface TooltipProps {
  content: string
  children: React.ReactNode
  className?: string
  wrapperClassName?: string
  align?: "center" | "left" | "right"
}

export function Tooltip({ content, children, className, wrapperClassName }: TooltipProps) {
  const [coords, setCoords] = React.useState<{ top: number; left: number } | null>(null)

  const handleMouseMove = (e: React.MouseEvent) => {
    setCoords({
      top: e.clientY + window.scrollY - 36,
      left: e.clientX + window.scrollX + 12,
    })
  }

  const hide = () => setCoords(null)

  return (
    <div className={cn("relative", wrapperClassName)}>
      <div
        className="h-full"
        onMouseMove={handleMouseMove}
        onMouseLeave={hide}
        onFocus={handleMouseMove as any}
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
              pointerEvents: "none",
            }}
            className={cn(
              "z-[9999] px-3 py-2 text-xs text-white bg-slate-900 dark:bg-slate-700 rounded-md shadow-lg w-max max-w-xs",
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