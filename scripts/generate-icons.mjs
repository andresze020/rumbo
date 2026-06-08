// Generates PWA icons for App Finanzas using sharp.
// Run once: node scripts/generate-icons.mjs
import sharp from 'sharp'
import { mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const iconsDir = join(__dirname, '..', 'public', 'icons')
mkdirSync(iconsDir, { recursive: true })

// Brand colors (approximation of oklch values from globals.css)
const BG = '#0f0f14'       // dark background oklch(0.145 0 0)
const PRIMARY = '#7c9cf5'  // dark-mode primary oklch(0.748 0.177 261)

// Regular icon SVG — ascending bars chart with trend line
// Content: x 72-440, y 98-438 within a 512x512 canvas
const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="${BG}"/>

  <!-- Bars ascending left→right, bottom-aligned at y=438 -->
  <rect x="72"  y="298" width="86" height="140" rx="14" fill="${PRIMARY}" opacity="0.45"/>
  <rect x="213" y="198" width="86" height="240" rx="14" fill="${PRIMARY}" opacity="0.72"/>
  <rect x="354" y="98"  width="86" height="340" rx="14" fill="${PRIMARY}"/>

  <!-- Trend line connecting bar tops -->
  <polyline
    points="115,298 256,198 397,98"
    stroke="${PRIMARY}" stroke-width="14"
    stroke-linecap="round" stroke-linejoin="round"
    fill="none" opacity="0.55"/>

  <!-- Dots at top of each bar -->
  <circle cx="115" cy="298" r="18" fill="${PRIMARY}" opacity="0.6"/>
  <circle cx="256" cy="198" r="18" fill="${PRIMARY}" opacity="0.85"/>
  <circle cx="397" cy="98"  r="18" fill="${PRIMARY}"/>
</svg>`

// Maskable icon SVG — same design scaled to fit within the 60% safe zone
// Safe zone for maskable: center 80% = x:102-410, y:102-410
const maskableSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="${BG}"/>

  <!-- Bars scaled to fit safe zone, bottom-aligned at y=400 -->
  <rect x="112" y="290" width="70" height="110" rx="12" fill="${PRIMARY}" opacity="0.45"/>
  <rect x="221" y="215" width="70" height="185" rx="12" fill="${PRIMARY}" opacity="0.72"/>
  <rect x="330" y="120" width="70" height="280" rx="12" fill="${PRIMARY}"/>

  <!-- Trend line -->
  <polyline
    points="147,290 256,215 365,120"
    stroke="${PRIMARY}" stroke-width="12"
    stroke-linecap="round" stroke-linejoin="round"
    fill="none" opacity="0.55"/>

  <!-- Dots -->
  <circle cx="147" cy="290" r="15" fill="${PRIMARY}" opacity="0.6"/>
  <circle cx="256" cy="215" r="15" fill="${PRIMARY}" opacity="0.85"/>
  <circle cx="365" cy="120" r="15" fill="${PRIMARY}"/>
</svg>`

const toBuffer = (svg) => Buffer.from(svg)

await sharp(toBuffer(iconSvg)).resize(192, 192).png().toFile(join(iconsDir, 'icon-192.png'))
console.log('✓ icon-192.png')

await sharp(toBuffer(iconSvg)).resize(512, 512).png().toFile(join(iconsDir, 'icon-512.png'))
console.log('✓ icon-512.png')

await sharp(toBuffer(maskableSvg)).resize(512, 512).png().toFile(join(iconsDir, 'icon-512-maskable.png'))
console.log('✓ icon-512-maskable.png')

console.log('\nAll icons generated in public/icons/')
