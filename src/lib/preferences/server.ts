import 'server-only'
import { createClient } from '@/lib/supabase/server'
import {
  DEFAULT_UI_PREFERENCES,
  parseUiPreferences,
  type UiPreferences,
} from './shared'

/**
 * The signed-in user's UI preferences (BR-032 + BR-038), or the defaults when
 * there is no session or the read fails. Never throws: a preference is a nicety,
 * and failing to load one must not take a page down.
 */
export async function getUiPreferences(): Promise<UiPreferences> {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return DEFAULT_UI_PREFERENCES

    const { data, error } = await supabase
      .from('profiles')
      .select('ui_preferences')
      .eq('id', user.id)
      .maybeSingle()

    if (error || !data) return DEFAULT_UI_PREFERENCES
    return parseUiPreferences(data.ui_preferences)
  } catch {
    return DEFAULT_UI_PREFERENCES
  }
}
