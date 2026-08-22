'use client'

import { useEffect } from 'react'
import type { TextSize } from '@/lib/preferences/shared'

/**
 * Puts the stored text-size preference on `<html data-text-size>`, where the
 * rules in `globals.css` pick it up.
 *
 * On `<html>` and not on the dashboard container because dialogs, sheets and
 * drawers portal to `document.body`, outside this tree — scoping the scale to
 * the container would leave every overlay at the default size.
 *
 * An effect and not a server-rendered attribute, because `<html>` belongs to
 * the root layout and the preference is only read one level down, where there
 * is already an authenticated Supabase client. The cost is one frame: a cold
 * load paints at the default scale before this runs. An inline script would
 * close that gap, but React refuses to execute one rendered inside a component
 * and logs a console error for trying. If the flash ever becomes a real
 * complaint, the fix is to mirror the value into a cookie the *root* layout can
 * read the way `getLocale()` already does — not to reintroduce the script.
 *
 * The attribute is cleared on unmount, so signing out does not leave `/login`
 * scaled. Renders nothing.
 */
export function TextSizeSync({ value }: { value: TextSize }) {
  useEffect(() => {
    const root = document.documentElement
    root.dataset.textSize = value

    return () => {
      delete root.dataset.textSize
    }
  }, [value])

  return null
}
