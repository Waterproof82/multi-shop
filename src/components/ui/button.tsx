import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all duration-150 ease-out disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.98]',
        destructive:
          'bg-destructive text-destructive-foreground hover:bg-destructive/90 active:scale-[0.98] focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40',
        outline:
          'border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50 active:scale-[0.98]',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-secondary/80 active:scale-[0.98]',
        ghost:
          'hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50 active:bg-accent/80',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-11 min-h-[44px] px-4 py-2 has-[>svg]:px-3',
        sm: 'h-10 min-h-[40px] rounded-md gap-1.5 px-3 has-[>svg]:px-2.5',
        lg: 'h-12 min-h-[48px] rounded-md px-6 has-[>svg]:px-4',
        icon: 'size-11 min-h-[44px] min-w-[44px]',
        'icon-sm': 'size-10 min-h-[40px] min-w-[40px]',
        'icon-lg': 'size-12 min-h-[48px] min-w-[48px]',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: Readonly<React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }>) {
  const Comp = asChild ? Slot : 'button'

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
export type { VariantProps } from 'class-variance-authority'

export type ButtonProps = Readonly<React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }>
