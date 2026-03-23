"use client"

import { forwardRef, useRef } from "react"
import { Button, type ButtonProps } from "@/components/ui/button"

interface RippleButtonProps extends Omit<ButtonProps, "onClick"> {
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void
}

export const RippleButton = forwardRef<HTMLButtonElement, RippleButtonProps>(
  function RippleButton({ onClick, className = "", children, ...props }, ref) {
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      const button = e.currentTarget
      const rect = button.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top

      button.style.setProperty("--ripple-x", `${x}px`)
      button.style.setProperty("--ripple-y", `${y}px`)

      // Clear any previous animation before starting a new one
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        button.classList.remove("ripple-active")
      }

      button.classList.add("ripple-active")

      timeoutRef.current = setTimeout(() => {
        button.classList.remove("ripple-active")
        timeoutRef.current = null
      }, 600)

      onClick?.(e)
    }

    return (
      <Button
        ref={ref}
        onClick={handleClick}
        className={`ripple-button ${className}`}
        {...props}
      >
        {children}
      </Button>
    )
  }
)
