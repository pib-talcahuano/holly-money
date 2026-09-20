#!/usr/bin/env node
// Serves docs/diagrams/ over http:// and opens the gallery in the browser.
// A plain `open gallery.html` (file://) is unreliable here — the gallery embeds
// each diagram in an iframe, and nested file:// iframes are blocked or flaky in
// some browsers (notably Safari). A real (if tiny, localhost-only) server avoids
// that entirely, the same way `pnpm email:dev` runs a dev server for templates.
import { createServer } from "node:http"
import { readFile, stat } from "node:fs/promises"
import { extname, join, normalize, resolve } from "node:path"
import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"

const scriptDir = fileURLToPath(new URL(".", import.meta.url))
const diagramsDir = resolve(scriptDir, "../docs/diagrams")

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".css": "text/css",
  ".js": "text/javascript"
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost")
  const requestedPath = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "")
  const filePath = join(diagramsDir, requestedPath === "/" ? "gallery.html" : requestedPath)

  if (!resolve(filePath).startsWith(diagramsDir)) {
    res.writeHead(400).end("Bad request")
    return
  }

  try {
    const info = await stat(filePath)
    const target = info.isDirectory() ? join(filePath, "gallery.html") : filePath
    const body = await readFile(target)
    res.writeHead(200, { "Content-Type": CONTENT_TYPES[extname(target)] ?? "application/octet-stream" })
    res.end(body)
  } catch {
    res.writeHead(404).end("Not found")
  }
})

server.listen(0, "127.0.0.1", () => {
  const { port } = server.address()
  const url = `http://127.0.0.1:${port}/gallery.html`
  console.log(`Serving docs/diagrams at ${url}`)
  console.log("Press Ctrl+C to stop.")

  const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open"
  const args = process.platform === "win32" ? ["", url] : [url]
  spawn(opener, args, { shell: process.platform === "win32", stdio: "ignore", detached: true }).unref()
})
