/*
 * Minimal typings for the Node builtins used by tests. The project has no
 * @types/node (app code is browser-only), but vitest runs on Node, so tests
 * that read repo files (e.g. cosmeticsCss.test.ts) may import these. Extend as
 * needed rather than pulling in the full @types/node surface.
 */
declare module 'node:fs' {
  export function readFileSync(path: string | URL, encoding: 'utf8'): string;
}
declare module 'node:url' {
  export function fileURLToPath(url: URL | string): string;
}
