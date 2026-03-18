import * as React from 'react'

import { cn } from '@/lib/utils'

function Textarea({ className, ...props }: Readonly<React.ComponentProps<'textarea'>>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'field-sizing-content placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input min-h-[80px] w-full rounded-md border bg-transparent px-3 py-2 text-base shadow-xs transition-colors duration-150 ease-out outline-none resize-y',
        'focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        'aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
