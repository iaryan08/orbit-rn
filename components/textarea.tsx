import * as React from 'react'

import { cn } from '@/lib/utils'

interface TextareaProps extends React.ComponentProps<'textarea'> {
  activeBorderClassName?: string
}

function Textarea({ className, activeBorderClassName, ...props }: TextareaProps) {
  const radiusMatch = className?.match(/rounded-[a-zA-Z0-9_-]+/);
  const radiusClass = radiusMatch ? radiusMatch[0] : '';

  return (
    <div className={cn("group relative w-full overflow-hidden", radiusClass)}>
      <textarea
        data-slot="textarea"
        className={cn(
          'placeholder:text-muted-foreground/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive',
          'flex field-sizing-content min-h-16 w-full bg-transparent px-3 py-2 text-base md:text-sm',
          'border-0 border-b border-[#424242] rounded-none shadow-none outline-none transition-all duration-300',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'focus:border-transparent',
          className,
        )}
        {...props}
      />
    </div>
  )
}

export { Textarea }
