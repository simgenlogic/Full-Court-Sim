#!/usr/bin/env node
// Enforces the engine/render/ui architectural boundary described in the project docs:
//   - src/engine/** is pure: no React/DOM imports, no Math.random(), no reaching into render/ui.
//   - src/render/** and src/ui/** may only import the engine's public barrel (src/engine/index.ts),
//     never an individual engine module directly. (src/data/** is exempt: static rosters are plain
//     data conforming to engine-defined shapes, not application logic reaching into the engine.)
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, join, relative } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const srcDir = join(root, 'src')

function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) out.push(...walk(full))
    else if (['.ts', '.tsx'].includes(extname(full))) out.push(full)
  }
  return out
}

const importRe = /import\s+(?:[^'"]+?\s+from\s+)?['"]([^'"]+)['"]/g

/** @type {string[]} */
const errors = []

for (const file of walk(srcDir)) {
  const rel = relative(root, file)
  const raw = readFileSync(file, 'utf8')
  // Strip comments so prose describing the rule (e.g. "never call Math.random()") doesn't self-trigger it.
  const content = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
  const isEngine = rel.startsWith('src/engine/')
  const isEngineIndex = rel === 'src/engine/index.ts'

  if (isEngine) {
    if (/\bMath\.random\s*\(/.test(content)) {
      errors.push(`${rel}: uses Math.random() — engine code must thread the seeded RNG instead.`)
    }
    if (/from\s+['"]react['"]/.test(content) || /from\s+['"]react-dom/.test(content)) {
      errors.push(`${rel}: engine code must not import React.`)
    }
  }

  for (const match of content.matchAll(importRe)) {
    const spec = match[1]
    if (isEngine && !isEngineIndex && (spec.includes('/render/') || spec.includes('/ui/'))) {
      errors.push(`${rel}: engine code must not import from render/ or ui/ (imports "${spec}").`)
    }
    const isRenderOrUi = rel.startsWith('src/render/') || rel.startsWith('src/ui/')
    if (isRenderOrUi && /\/engine\//.test(spec) && !/\/engine(\/index(\.ts)?)?$/.test(spec)) {
      errors.push(
        `${rel}: only the engine's public barrel may be imported (got "${spec}") — import from ".../engine" instead.`,
      )
    }
  }
}

if (errors.length > 0) {
  console.error('Architectural boundary violations:\n')
  for (const e of errors) console.error(`  - ${e}`)
  console.error(`\n${errors.length} violation(s) found.`)
  process.exit(1)
}

console.log('Boundary check passed: engine stays pure, render/ui only use the engine barrel.')
