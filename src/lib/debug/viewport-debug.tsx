'use client'

import { useEffect, useState } from 'react'
import { Bug } from 'lucide-react'

/**
 * Temporary on-device viewport readout.
 *
 * Not a product feature: it exists to diagnose a report of the dashboard
 * loading "zoomed", with the bottom nav's labels off screen, on the Home and
 * Reports screens but not on Accounts — and on one install but not another.
 * Reasoning from screenshots has not settled it, so this reports the actual
 * numbers from the device. Delete the component, its mount in the dashboard
 * layout, and the row in `/dashboard/more` once that is closed.
 *
 * Off unless localStorage `af_vv_debug` is '1'. `?vvdebug=1` sets the flag, so
 * it also survives a reload inside an installed PWA.
 */

const FLAG = 'af_vv_debug'

type Line = { label: string; value: string }

function read(): Line[] {
  const root = document.documentElement
  const vv = window.visualViewport

  // env() only resolves in a real declaration, so measure it off a probe.
  const probe = document.createElement('div')
  probe.style.cssText =
    'position:fixed;visibility:hidden;padding-top:env(safe-area-inset-top);' +
    'padding-bottom:env(safe-area-inset-bottom);padding-left:env(safe-area-inset-left);' +
    'padding-right:env(safe-area-inset-right)'
  document.body.appendChild(probe)
  const inset = getComputedStyle(probe)
  const safe = `t${parseFloat(inset.paddingTop)} b${parseFloat(inset.paddingBottom)} l${parseFloat(
    inset.paddingLeft
  )} r${parseFloat(inset.paddingRight)}`
  probe.remove()

  // Where `bottom: 0` / `right: 0` actually land, measured the same way
  // `ViewportPin` measures it. If this disagrees with the layout viewport, the
  // fixed chrome is anchored outside the visible box.
  const edge = document.createElement('div')
  edge.style.cssText =
    'position:fixed;left:0;right:0;bottom:0;height:1px;visibility:hidden;pointer-events:none'
  document.body.appendChild(edge)
  const edgeRect = edge.getBoundingClientRect()
  edge.remove()

  const nav = document.querySelector('nav.vv-pin-bottom') as HTMLElement | null
  const navRect = nav?.getBoundingClientRect()

  // Anything sticking out past the layout viewport is what would make the page
  // wider than the screen. Fixed elements are skipped: they resolve against the
  // initial containing block rather than the layout viewport, so `inset-x-0`
  // chrome always reads as overflowing without being able to cause any — and it
  // was crowding the real culprit out of the list.
  const offenders: { label: string; over: number }[] = []
  const all = Array.from(document.body.querySelectorAll<HTMLElement>('*')).slice(0, 4000)
  for (const el of all) {
    if (el.closest('[data-vv-debug]')) continue
    const style = getComputedStyle(el)
    if (style.position === 'fixed' || style.position === 'sticky') continue
    const rect = el.getBoundingClientRect()
    if (rect.width === 0) continue
    const over = Math.max(rect.right - root.clientWidth, -rect.left)
    if (over > 1) {
      const cls = el.className?.toString().split(/\s+/).slice(0, 2).join('.')
      // The parent's width is what turns "this is wide" into "this refuses to
      // fit": a child wider than its parent is content that will not shrink,
      // a child the same width as an over-wide parent is just inheriting it.
      const parent = el.parentElement
      const parentRect = parent?.getBoundingClientRect()
      const parentCls = parent?.className?.toString().split(/\s+/).slice(0, 1).join('')
      offenders.push({
        label: `${el.tagName.toLowerCase()}${cls ? '.' + cls : ''} w${Math.round(rect.width)} +${Math.round(
          over
        )} in ${parent ? parent.tagName.toLowerCase() : '?'}${
          parentCls ? '.' + parentCls : ''
        } w${parentRect ? Math.round(parentRect.width) : '?'}`,
        over,
      })
    }
  }
  offenders.sort((a, b) => b.over - a.over)
  const wide = offenders.map((item) => item.label)

  return [
    { label: 'win', value: `${window.innerWidth}x${window.innerHeight}` },
    { label: 'layout', value: `${root.clientWidth}x${root.clientHeight}` },
    { label: 'scroll', value: `${root.scrollWidth}x${root.scrollHeight}` },
    {
      label: 'visual',
      value: vv
        ? `${Math.round(vv.width)}x${Math.round(vv.height)} @${vv.scale.toFixed(3)} +${Math.round(
            vv.offsetLeft
          )},${Math.round(vv.offsetTop)}`
        : 'n/a',
    },
    {
      label: 'gutter',
      value: `x${window.innerWidth - root.clientWidth} y${window.innerHeight - root.clientHeight}`,
    },
    {
      label: 'overflow',
      value: `${getComputedStyle(root).overflowX}/${getComputedStyle(document.body).overflowX}`,
    },
    { label: 'dpr', value: String(window.devicePixelRatio) },
    {
      label: 'mode',
      value: window.matchMedia('(display-mode: standalone)').matches ? 'standalone' : 'browser',
    },
    { label: 'safe', value: safe },
    {
      label: 'boxes',
      value: `html ${Math.round(root.getBoundingClientRect().width)} body ${Math.round(
        document.body.getBoundingClientRect().width
      )}`,
    },
    { label: 'root px', value: getComputedStyle(root).fontSize },
    { label: 'vv attr', value: root.getAttribute('data-vv-offset') ? 'offset' : root.getAttribute('data-vv-zoomed') ? 'zoomed' : 'none' },
    {
      label: 'fixed',
      value: `bottom ${Math.round(edgeRect.bottom)} right ${Math.round(edgeRect.right)}`,
    },
    {
      label: 'nav',
      value: navRect
        ? `top ${Math.round(navRect.top)} bottom ${Math.round(navRect.bottom)} h ${Math.round(
            navRect.height
          )}`
        : 'not found',
    },
    { label: 'over', value: wide.length ? `${wide.length}: ${wide.slice(0, 3).join(' | ')}` : 'none' },
    { label: 'path', value: window.location.pathname },
  ]
}

export function ViewportDebug() {
  const [lines, setLines] = useState<Line[] | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('vvdebug') === '1') localStorage.setItem(FLAG, '1')
    if (params.get('vvdebug') === '0') localStorage.removeItem(FLAG)
    if (localStorage.getItem(FLAG) !== '1') return

    const tick = () => setLines(read())
    tick()
    const id = window.setInterval(tick, 700)
    const vv = window.visualViewport
    vv?.addEventListener('resize', tick)
    vv?.addEventListener('scroll', tick)
    window.addEventListener('resize', tick)

    return () => {
      window.clearInterval(id)
      vv?.removeEventListener('resize', tick)
      vv?.removeEventListener('scroll', tick)
      window.removeEventListener('resize', tick)
    }
  }, [])

  if (!lines) return null

  return (
    <div
      data-vv-debug=""
      className="fixed inset-x-1 top-16 z-[70] rounded-lg border border-amber-400/60 bg-black/85 p-2 font-mono text-[10px] leading-[1.35] text-amber-200 shadow-lg"
    >
      {lines.map((line) => (
        <div key={line.label} className="flex gap-1.5">
          <span className="w-12 shrink-0 text-amber-400/70">{line.label}</span>
          <span className="min-w-0 break-all">{line.value}</span>
        </div>
      ))}
      <button
        type="button"
        onClick={() => {
          localStorage.removeItem(FLAG)
          setLines(null)
        }}
        className="mt-1 rounded border border-amber-400/60 px-2 py-0.5 text-amber-200"
      >
        x
      </button>
    </div>
  )
}

/**
 * Row for `/dashboard/more` that turns the readout above on and off from
 * inside an installed PWA, where there is no address bar to add `?vvdebug=1`.
 * Temporary, same lifetime as the panel.
 */
export function ViewportDebugToggle() {
  const [on, setOn] = useState(false)

  useEffect(() => {
    // Same shape as `ThemeToggle`: read the client-only value on the next
    // frame rather than synchronously inside the effect body.
    const frame = window.requestAnimationFrame(() =>
      setOn(localStorage.getItem(FLAG) === '1')
    )
    return () => window.cancelAnimationFrame(frame)
  }, [])

  return (
    <button
      type="button"
      onClick={() => {
        if (on) localStorage.removeItem(FLAG)
        else localStorage.setItem(FLAG, '1')
        window.location.reload()
      }}
      className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-medium text-muted-foreground hover:text-foreground"
    >
      <Bug className="size-4 shrink-0" aria-hidden="true" />
      <span>Viewport debug</span>
      <span className="ml-auto font-mono text-xs">{on ? 'ON' : 'OFF'}</span>
    </button>
  )
}
