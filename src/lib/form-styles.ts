/**
 * Form field class constants shared by server and client components.
 * (Kept out of any 'use client' module so server pages can import them.)
 */

/** Bare native select (keeps the platform arrow) matching the Input styling. */
export const nativeSelectCls =
  'h-11 w-full truncate rounded-xl border border-input bg-transparent px-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30'

/** Chevron-dressed select (appearance-none); used by SelectField. */
export const selectFieldCls =
  'h-11 w-full appearance-none truncate rounded-xl border border-input bg-transparent pl-10 pr-9 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30'

/** Form action row: stacked full-width buttons on mobile, inline on desktop. */
export const formActionsCls =
  'flex flex-col gap-2 pt-1 sm:flex-row sm:flex-wrap sm:items-center'

/** Buttons inside a form action row: comfy touch height on mobile. */
export const formBtnCls = 'h-11 rounded-xl text-sm sm:h-8 sm:rounded-lg'
