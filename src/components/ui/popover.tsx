import * as React from "react"
import { createPortal } from "react-dom"
import { cn } from "@/lib/utils"

interface PopoverProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children: React.ReactNode
}

const PopoverContext = React.createContext<{
  open: boolean
  onOpenChange: (open: boolean) => void
}>({
  open: false,
  onOpenChange: () => {},
})

const Popover = ({ open: controlledOpen, onOpenChange, children }: PopoverProps) => {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false)

  const open = controlledOpen !== undefined ? controlledOpen : uncontrolledOpen
  const handleOpenChange = onOpenChange || setUncontrolledOpen

  return (
    <PopoverContext.Provider value={{ open, onOpenChange: handleOpenChange }}>
      <div className="relative inline-block">
        {children}
      </div>
    </PopoverContext.Provider>
  )
}
Popover.displayName = "Popover"

interface PopoverTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean
  children: React.ReactNode
}

const PopoverTrigger = React.forwardRef<HTMLButtonElement, PopoverTriggerProps>(
  ({ asChild, children, ...props }, ref) => {
    const { open, onOpenChange } = React.useContext(PopoverContext)

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation()
      onOpenChange(!open)
      props.onClick?.(e)
    }

    if (asChild && React.isValidElement(children)) {
      return React.cloneElement(children as React.ReactElement<any>, {
        onClick: handleClick,
        ref,
        'aria-expanded': open,
        'aria-haspopup': 'true',
      })
    }

    return (
      <button
        ref={ref}
        onClick={handleClick}
        aria-expanded={open}
        aria-haspopup="true"
        {...props}
      >
        {children}
      </button>
    )
  }
)
PopoverTrigger.displayName = "PopoverTrigger"

interface PopoverContentProps extends React.HTMLAttributes<HTMLDivElement> {
  align?: "start" | "center" | "end"
  side?: "top" | "bottom" | "left" | "right"
  sideOffset?: number
  children: React.ReactNode
}

const PopoverContent = React.forwardRef<HTMLDivElement, PopoverContentProps>(
  ({ className, align = "center", side = "bottom", sideOffset = 8, children, ...props }, ref) => {
    const { open, onOpenChange } = React.useContext(PopoverContext)
    const contentRef = React.useRef<HTMLDivElement>(null)
    const [triggerRect, setTriggerRect] = React.useState<DOMRect | null>(null)

    // Capture trigger position when popover opens
    React.useEffect(() => {
      if (open) {
        const trigger = document.querySelector('[aria-expanded="true"]')
        if (trigger) {
          const rect = trigger.getBoundingClientRect()
          // Convert viewport coordinates to document coordinates
          const absoluteRect = new DOMRect(
            rect.x + window.scrollX,
            rect.y + window.scrollY,
            rect.width,
            rect.height
          )
          setTriggerRect(absoluteRect)
        }
      } else {
        setTriggerRect(null)
      }
    }, [open])

    // Handle click outside and escape key
    React.useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
        const target = event.target as Node

        // Check if click is on the trigger button
        const trigger = document.querySelector('[aria-expanded="true"]')
        if (trigger && trigger.contains(target)) {
          return
        }

        // Check if click is outside the popover content
        if (
          contentRef.current &&
          !contentRef.current.contains(target)
        ) {
          onOpenChange(false)
        }
      }

      const handleEscape = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
          onOpenChange(false)
        }
      }

      if (open) {
        document.addEventListener("mousedown", handleClickOutside)
        document.addEventListener("keydown", handleEscape)
      }

      return () => {
        document.removeEventListener("mousedown", handleClickOutside)
        document.removeEventListener("keydown", handleEscape)
      }
    }, [open, onOpenChange])


    React.useImperativeHandle(ref, () => contentRef.current as HTMLDivElement)

    if (!open) return null

    // Get trigger position
    if (!triggerRect) return null

    // Calculate absolute position based on trigger (document coordinates)
    const style: React.CSSProperties = {
      position: 'absolute',
      zIndex: 9999,
    }

    // Horizontal alignment
    if (align === 'end') {
      style.left = `${triggerRect.right}px`
      style.transform = 'translateX(-100%)'
    } else if (align === 'start') {
      style.left = `${triggerRect.left}px`
    } else {
      style.left = `${triggerRect.left + triggerRect.width / 2}px`
      style.transform = 'translateX(-50%)'
    }

    // Vertical positioning
    if (side === 'bottom') {
      style.top = `${triggerRect.bottom + sideOffset}px`
    } else if (side === 'top') {
      style.top = `${triggerRect.top - sideOffset}px`
      style.transform = (style.transform || '') + ' translateY(-100%)'
    }

    return createPortal(
      <div
        ref={contentRef}
        className={cn(
          "min-w-[8rem] rounded-lg border border-subtle bg-elevated shadow-lg",
          "animate-in fade-in-0 zoom-in-95",
          className
        )}
        style={style}
        role="dialog"
        aria-modal="true"
        {...props}
      >
        {children}
      </div>,
      document.body
    )
  }
)
PopoverContent.displayName = "PopoverContent"

export { Popover, PopoverTrigger, PopoverContent }
