#!/usr/bin/env node
// Opens a local index page linking to every docs/diagrams/*.html Archify diagram,
// so reviewing them doesn't mean hunting for files or opening a dozen tabs by hand.
import { readFileSync, readdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"

const scriptDir = fileURLToPath(new URL(".", import.meta.url))
const diagramsDir = resolve(scriptDir, "../docs/diagrams")

function extractTitle(html) {
  const match = html.match(/<title>([^<]+)<\/title>/i)
  return match ? match[1].trim() : null
}

function extractDescription(html) {
  const match = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i)
  return match ? match[1].trim() : null
}

const files = readdirSync(diagramsDir)
  .filter((name) => name.endsWith(".html"))
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))

if (files.length === 0) {
  console.error(`No .html diagrams found in ${diagramsDir}`)
  process.exit(1)
}

const rows = files.map((name) => {
  const html = readFileSync(join(diagramsDir, name), "utf8")
  const title = extractTitle(html) ?? name
  const description = extractDescription(html) ?? ""
  const href = join(diagramsDir, name)
  return { name, title, description, href }
})

const listItems = rows
  .map(
    ({ name, title, description, href }) => `
      <li>
        <a href="file://${href}">${title}</a>
        <code>${name}</code>
        ${description ? `<p>${description}</p>` : ""}
      </li>`
  )
  .join("\n")

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Holly Money — Diagrams</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; max-width: 720px; margin: 48px auto; padding: 0 24px; color: #1a1a1a; }
  h1 { font-size: 1.4rem; }
  ul { list-style: none; padding: 0; }
  li { padding: 14px 0; border-bottom: 1px solid #e5e5e5; }
  a { font-size: 1.05rem; font-weight: 600; text-decoration: none; color: #0b5fff; }
  a:hover { text-decoration: underline; }
  code { display: block; font-size: 0.8rem; color: #888; margin-top: 2px; }
  p { margin: 6px 0 0; color: #555; font-size: 0.9rem; }
</style>
</head>
<body>
  <h1>Holly Money — flow &amp; architecture diagrams</h1>
  <p>${rows.length} diagrams, generated from <code>docs/diagrams/</code>.</p>
  <ul>
    ${listItems}
  </ul>
</body>
</html>`

const indexPath = join(tmpdir(), "holly-money-diagrams-index.html")
writeFileSync(indexPath, page)

console.log(`Diagrams (${rows.length}):`)
for (const { name, title } of rows) console.log(`  ${name} — ${title}`)

const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open"
const args = process.platform === "win32" ? ["", indexPath] : [indexPath]
spawn(opener, args, { shell: process.platform === "win32", stdio: "ignore", detached: true }).unref()
