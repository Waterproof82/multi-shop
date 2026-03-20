"use client"

import { forwardRef } from "react"
import { Button, type ButtonProps } from "@/components/ui/button"

interface RippleButtonProps extends Omit<ButtonProps, "onClick"> {
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void
}

export const RippleButton = forwardRef<HTMLButtonElement, RippleButtonProps>(
  function RippleButton({ onClick, className = "", children, ...props }, ref) {
    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      const button = e.currentTarget
      const rect = button.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top

      button.style.setProperty("--ripple-x", `${x}px`)
      button.style.setProperty("--ripple-y", `${y}px`)
      button.classList.add("ripple-active")

      const timeoutId = setTimeout(() => {
        button.classList.remove("ripple-active")
      }, 600)

      const handleCleanup = () => {
        clearTimeout(timeoutId)
        button.removeEventListener("click", handleCleanup)
      }
      button.addEventListener("click", handleCleanup, { once: true })

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
