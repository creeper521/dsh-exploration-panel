/**
 * Standalone build for dsh-exploration-panel.
 *
 * Emits two artifact families, mirroring the in-repo clientBundle preset:
 *
 * - Node library (src/*.ts → lib/*.js, ESM): loaded by the dsh Loader from
 *   the profile composition. Types are emitted separately by tsc
 *   (tsconfig.build.json → lib/types).
 * - Browser client bundle (src/client/index.ts → lib/client.js, CJS): the
 *   closure-factory artifact the dsh client loader serves. The bundle calls
 *   window.__ModuleLoader__.load({ id, factory }) and resolves platform
 *   modules through the injected require (the frozen module table — see
 *   PLATFORM_MODULES below). CSS Modules compile through lightningcss and
 *   auto-inject a <style data-plugin> tag at factory execution.
 */
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { basename, dirname, resolve as resolvePath } from 'node:path'
import { transform } from 'lightningcss'

/**
 * The module specifiers the dsh shell shares into the frozen browser module
 * table. Must stay byte-identical with the shipped
 * `packages/client/web/src/platform.ts` list plus the documented runtime
 * store exemption. Anything else under @deepseek-ai/* must either be a
 * type-only import (erased, never reaches the gate) or an inline-safe wire
 * layer; a value import of a non-table package is a build error.
 */
const PLATFORM_MODULES = [
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-web-react',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-attachment',
  '@deepseek-ai/dsh-client-schema-form',
]

const RUNTIME_STORE_EXEMPTION = '@deepseek-ai/dsh-client-runtime/client'

const CLIENT_EXTERNALS = [...PLATFORM_MODULES, RUNTIME_STORE_EXEMPTION]

const CSS_VIRTUAL_PREFIX = '\0dsh-css:'
const CSS_VIRTUAL_SUFFIX = '.mjs'

/** The client plugin id stamped into the loader handoff (the npm package name). */
const CLIENT_ID = 'dsh-exploration-panel'

// The browser half may not exist yet (the frontend contract lives in
// CLIENT.md); the node library must still build without it.
const HAS_CLIENT = existsSync('src/client/index.ts')

const configs = [
  // ── Node library ──────────────────────────────────────────────────────
  {
    name: 'dsh-exploration-panel',
    entry: ['src/index.ts', 'src/tool.ts', 'src/projection.ts', 'src/invariant.ts'],
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2022',
    dts: false,
    // Keep the emitted names lib/<entry>.js so the package.json exports map
    // (./tool → ./lib/tool.js, …) resolves; tsdown's default would append .mjs.
    fixedExtension: false,
    clean: true,
  },
]
if (HAS_CLIENT) {
  configs.push(
    // ── Browser client bundle ─────────────────────────────────────────────
    {
      name: `${CLIENT_ID}/client`,
      entry: { client: 'src/client/index.ts' },
    outDir: 'lib',
    format: 'cjs',
    platform: 'browser',
    dts: false,
    clean: false,
    sourcemap: true,
    external: [...CLIENT_EXTERNALS],
    define: {
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
      'import.meta.env.MODE': JSON.stringify(process.env.NODE_ENV ?? 'production'),
      'import.meta.env': JSON.stringify({ MODE: process.env.NODE_ENV ?? 'production' }),
    },
    // Everything not in the loader module table must inline: a require()
    // the table cannot answer is a guaranteed runtime throw.
    noExternal: (id) => (CLIENT_EXTERNALS.includes(id) ? undefined : true),
    plugins: [
      {
        // Bundle purity gate: platform modules stay external, every other
        // @deepseek-ai value import is a build error (cross-plugin value
        // imports would inline a duplicate runtime instance or require a
        // specifier the frozen module table cannot answer).
        name: 'dsh-exploration-client-purity',
        resolveId(source) {
          if (!source.startsWith('@deepseek-ai/')) return null
          if (CLIENT_EXTERNALS.includes(source)) return null
          throw new Error(
            `client bundle purity: "${source}" is not a platform module — `
            + 'cross-plugin value imports are forbidden; use type-only imports (erased) or cordis services',
          )
        },
      },
      {
        name: 'dsh-exploration-css-modules',
        resolveId(source, importer) {
          if (!source.endsWith('.module.css')) return null
          const abs = importer !== undefined ? resolvePath(dirname(importer), source) : source
          return CSS_VIRTUAL_PREFIX + abs + CSS_VIRTUAL_SUFFIX
        },
        async load(virtualId) {
          if (!virtualId.startsWith(CSS_VIRTUAL_PREFIX)) return null
          const fileId = virtualId.slice(CSS_VIRTUAL_PREFIX.length, -CSS_VIRTUAL_SUFFIX.length)
          this.addWatchFile(fileId)
          const source = await readFile(fileId)
          const { code, exports: cssExports } = transform({
            filename: fileId,
            code: source,
            cssModules: { pattern: '[hash]_[local]' },
            minify: true,
          })
          const classMap = {}
          for (const [local, exp] of Object.entries(cssExports ?? {})) classMap[local] = exp.name
          const tagId = `${CLIENT_ID}/${basename(fileId)}`
          return [
            `const css = ${JSON.stringify(code.toString())};`,
            `const tagId = ${JSON.stringify(tagId)};`,
            'if (typeof document !== \'undefined\' && document.querySelector(\'style[data-plugin-css=\' + JSON.stringify(tagId) + \']\') === null) {',
            '  const tag = document.createElement(\'style\');',
            `  tag.dataset.plugin = ${JSON.stringify(CLIENT_ID)};`,
            '  tag.dataset.pluginCss = tagId;',
            '  tag.textContent = css;',
            '  document.head.appendChild(tag);',
            '}',
            `export default ${JSON.stringify(classMap)};`,
          ].join('\n')
        },
      },
    ],
    outputOptions: {
      entryFileNames: 'client.js',
      banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(CLIENT_ID)}, factory: (require) => {`,
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
    },
  })
}

export default configs
