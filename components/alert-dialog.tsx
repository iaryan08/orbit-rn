'use client'

import * as React from 'react'
import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog'

import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'

function AlertDialog({
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Root>) {
  return <AlertDialogPrimitive.Root data-slot="alert-dialog" {...props} />
}

function AlertDialogTrigger({
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Trigger>) {
  return (
    <AlertDialogPrimitive.Trigger data-slot="alert-dialog-trigger" {...props} />
  )
}

function AlertDialogPortal({
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Portal>) {
  return (
    <AlertDialogPrimitive.Portal data-slot="alert-dialog-portal" {...props} />
  )
}

function AlertDialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Overlay>) {
  return (
    <AlertDialogPrimitive.Overlay
      data-slot="alert-dialog-overlay"
      className={cn(
        'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-[110] bg-black/95 will-change-opacity transition-opacity duration-120 ease-out',
        className,
      )}
      {...props}
    />
  )
}

function AlertDialogContent({
  className,
  onOpenAutoFocus,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Content>) {
  const contentRef = React.useRef<HTMLDivElement>(null)

  return (
    <AlertDialogPortal>
      <AlertDialogOverlay />
      <AlertDialogPrimitive.Content
        data-slot="alert-dialog-content"
        ref={contentRef}
        onOpenAutoFocus={(e) => {
          if (onOpenAutoFocus) return onOpenAutoFocus(e)
          e.preventDefault()
          contentRef.current?.focus()
        }}
        onCloseAutoFocus={(e) => e.preventDefault()}
        tabIndex={-1}
        className={cn(
          'bg-neutral-950/98 border border-white/10 p-8 shadow-[0_0_80px_-12px_rgba(0,0,0,0.5)] duration-120 ease-out fixed top-[50%] left-[50%] z-[112] grid grid-rows-[auto,minmax(0,1fr),auto] w-[90vw] max-w-[90vw] translate-x-[-50%] translate-y-[-50%] gap-0 rounded-[1.5rem] outline-none grid-cols-1 overflow-hidden',
          'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
          className,
        )}
        {...props}
      />
      {/* ── Status Bar Fade Guard for Alerts (Above alert content z-index) ── */}
      <div
        className="fixed top-0 left-0 right-0 pointer-events-none z-[113]"
        style={{
          height: 'calc(env(safe-area-inset-top, 24px) + 8px)',
          background: 'linear-gradient(to bottom, #000 40%, rgba(0,0,0,0.7) 70%, transparent 100%)'
        }}
      />
    </AlertDialogPortal>
  )
}

function AlertDialogHeader({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-dialog-header"
      className={cn('flex flex-col gap-3 text-center sm:text-left', className)}
      {...props}
    />
  )
}

function AlertDialogFooter({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-dialog-footer"
      className={cn(
        'flex flex-row gap-3 mt-2 font-bold',
        className,
      )}
      {...props}
    />
  )
}

function AlertDialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Title>) {
  return (
    <AlertDialogPrimitive.Title
      data-slot="alert-dialog-title"
      className={cn('text-white text-2xl font-serif font-bold tracking-tight', className)}
      {...props}
    />
  )
}

function AlertDialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Description>) {
  return (
    <AlertDialogPrimitive.Description
      data-slot="alert-dialog-description"
      className={cn('text-white/50 text-[13px] leading-relaxed font-medium', className)}
      {...props}
    />
  )
}

function AlertDialogAction({
  className,
  variant,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Action> & {
  variant?: keyof typeof buttonVariants extends { variant: infer V } ? V : string;
}) {
  return (
    <AlertDialogPrimitive.Action
      className={cn(
        buttonVariants({ variant: (variant as any) || 'default', className }),
        'flex-1 h-11 border-none font-black uppercase tracking-[0.2em] rounded-full',
        className
      )}
      {...props}
    />
  )
}

function AlertDialogCancel({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Cancel>) {
  return (
    <AlertDialogPrimitive.Cancel
      className={cn(
        'flex-1 bg-black border border-white/10 text-white hover:bg-neutral-900 rounded-full h-11 text-[11px] font-black uppercase tracking-[0.2em] transition-all duration-200 active:scale-95 outline-none focus:outline-none',
        className
      )}
      {...props}
    />
  )
}

export {
  AlertDialog,
  AlertDialogPortal,
  AlertDialogOverlay,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
}
