import 'server-only'
import { getRequestProfile } from '@/lib/supabase/request'
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
    // Shared with every other reader in this request (lib/supabase/request).
    const profile = await getRequestProfile()
    if (!profile) return DEFAULT_UI_PREFERENCES
    return parseUiPreferences(profile.ui_preferences)
  } catch {
    return DEFAULT_UI_PREFERENCES
  }
}
