import MorePage from './page'

/**
 * More has no data to wait for — it is the nav config and two toggles — so its
 * "loading" state is the page itself (MQ-009). It used to be a skeleton that
 * said "Loading more options and preferences" on every visit, for a screen
 * that could render at once.
 *
 * The file cannot simply go: without it, the nearest boundary is
 * `dashboard/loading.tsx`, and a tap on More would flash the *Dashboard's*
 * skeleton instead.
 */
export default function MoreLoading() {
  return <MorePage />
}
