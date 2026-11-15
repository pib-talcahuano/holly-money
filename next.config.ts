import type { NextConfig } from "next"
import path from "path"
import { execSync } from "child_process"

function getCommitHash(short = true) {
  try {
    return execSync(`git rev-parse ${short ? "--short " : ""}HEAD`)
      .toString()
      .trim()
  } catch {
    return short ? "dev" : ""
  }
}

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname)
  },
  // @react-pdf/renderer and its subpackages ship as ESM-only ("type": "module"),
  // which Jest's default CJS transform can't parse without this.
  transpilePackages: [
    "@react-pdf/renderer",
    "@react-pdf/fns",
    "@react-pdf/font",
    "@react-pdf/image",
    "@react-pdf/layout",
    "@react-pdf/pdfkit",
    "@react-pdf/primitives",
    "@react-pdf/reconciler",
    "@react-pdf/render",
    "@react-pdf/stylesheet",
    "@react-pdf/svg",
    "@react-pdf/textkit",
    "@react-pdf/types",
    "color-string",
    "color-name",
    "colorspace",
    "yoga-layout"
  ],
  env: {
    NEXT_PUBLIC_COMMIT_SHA: getCommitHash(),
    NEXT_PUBLIC_COMMIT_SHA_FULL: getCommitHash(false)
  },
  experimental: {
    // Every page is dynamic, so by default the client router refetches a page each
    // time it's visited. Keep a visited page for 30s so back/forward and quick
    // revisits are instant. Mutations still invalidate it (revalidatePath in server
    // actions, router.refresh() after API calls and realtime events).
    staleTimes: {
      dynamic: 30
    },
    serverActions: {
      // Default is 1MB, which rejects movement attachment uploads (up to 30MB).
      // 35mb leaves headroom above the 30MB file cap for multipart overhead.
      bodySizeLimit: "35mb"
    }
  }
}

export default nextConfig
