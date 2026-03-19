import * as React from 'react'

import { cn } from '@/lib/utils'

function Checkbox({
  className,
  ...props
}: React.ComponentProps<'input'> & {
  indeterminate?: boolean
}) {
  const ref = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    if (ref.current) {
      ref.current.indeterminate = props.indeterminate ?? false
    }
  }, [props.indeterminate])

  return (
    <input
      type="checkbox"
      ref={ref}
      data-slot="checkbox"
      className={cn(
        'h-4 w-4 rounded border border-border text-primary focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background cursor-pointer accent-primary',
        'aria-invalid:border-destructive aria-invalid:ring-destructive/20',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}

export { Checkbox }
