// eslint-disable-next-line @typescript-eslint/no-require-imports
const nextJest = require("next/jest")

const createJestConfig = nextJest({
  dir: "./"
})

const customJestConfig = {
  setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],
  testEnvironment: "jest-environment-jsdom",
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1"
  },
  testMatch: ["**/__tests__/**/*.[jt]s?(x)", "**/?(*.)+(spec|test).[jt]s?(x)"],
  // e2e/ is a separate Playwright suite (pnpm test:e2e) — its *.spec.ts files
  // import @playwright/test, which doesn't run under jest/jsdom.
  testPathIgnorePatterns: ["/node_modules/", "/.next/", "/.worktrees/", "/.claude/", "/e2e/"],
  modulePathIgnorePatterns: ["<rootDir>/.claude/"],
  transform: {
    "^.+\\.(js|jsx|ts|tsx)$": ["babel-jest", { presets: ["next/babel"] }]
  }
}

// react-markdown and its unified/remark/micromark dependency tree ship ESM only.
// next/jest forces "/node_modules/" into transformIgnorePatterns, so extend it
// after the config resolves.
const ESM_PACKAGES = [
  "react-markdown",
  "remark-[^/]+",
  "unified",
  "bail",
  "devlop",
  "trough",
  "vfile[^/]*",
  "unist-[^/]+",
  "mdast-[^/]+",
  "hast-[^/]+",
  "micromark[^/]*",
  "decode-named-character-reference",
  "character-entities[^/]*",
  "property-information",
  "space-separated-tokens",
  "comma-separated-tokens",
  "html-url-attributes",
  "is-plain-obj",
  "trim-lines",
  "ccount",
  "zwitch",
  "estree-util-[^/]+",
  "markdown-table",
  "longest-streak",
  "stringify-entities",
  "parse-entities",
  "escape-string-regexp"
].join("|")

module.exports = async () => {
  const config = await createJestConfig(customJestConfig)()
  return {
    ...config,
    // Add the ESM packages to every lookahead list next/jest generated (they all
    // start with the @react-pdf entries), keeping its existing exceptions intact.
    transformIgnorePatterns: config.transformIgnorePatterns.map((pattern) =>
      pattern.replaceAll("(@react-pdf", `(${ESM_PACKAGES}|@react-pdf`)
    )
  }
}
