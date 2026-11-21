import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import monkey from 'vite-plugin-monkey'
import { ehMatchPatterns } from '@better-eh/site-eh/metadata'
import { nhentaiMatchPatterns } from '@better-eh/site-nhentai/metadata'
import manifest from './package.json' with { type: 'json' }

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    monkey({
      entry: './src/userscript.ts',
      userscript: {
        name: {
          '': 'Better EH',
          'zh-CN': 'Better EH 画廊浏览器',
        },
        namespace: 'better-eh',
        version: manifest.version,
        description: {
          '': 'A gallery browser for E-Hentai, ExHentai and nHentai on desktop and iOS',
          'zh-CN': '适用于桌面 Tampermonkey 和 iOS Userscripts 的 E-Hentai、ExHentai 和 nHentai 画廊浏览器。',
        },
        match: [...ehMatchPatterns, ...nhentaiMatchPatterns],
        'run-at': 'document-end',
        noframes: true,
        grant: 'none',
      },
      build: {
        fileName: 'better-eh.user.js',
        metaFileName: 'better-eh.meta.js',
      },
      styleImport: false,
    }),
    {
      name: 'better-eh-source-attribution',
      apply: 'build',
      enforce: 'post',
      generateBundle(_options, bundle) {
        const script = bundle['better-eh.user.js']
        const attribution = `/*
 * Better EH bundles these libraries for a single-file userscript build.
 * Vue 3.5.45 — https://github.com/vuejs/core
 * Pinia 4.1.0 — https://github.com/vuejs/pinia
 * @vueuse/core 15.0.0 — https://github.com/vueuse/vueuse
 * @vueuse/motion 3.0.3 — https://github.com/vueuse/motion
 * @lucide/vue 1.75.0 — https://github.com/lucide-icons/lucide
 * es-toolkit 1.53.2 — https://github.com/toss/es-toolkit
 * Tag translations: EhTagTranslation Database contributors, v7.30120.1
 * https://github.com/EhTagTranslation/Database — CC BY-NC-SA 3.0 CN
 * https://creativecommons.org/licenses/by-nc-sa/3.0/cn/
 * nHentai translations: lgou2w / L2 Studio, @l2studio/nhentai-tags 0.3.5
 * https://github.com/l2studio/nhentai-tags — package Apache-2.0, translation data CC BY-SA 3.0
 * https://creativecommons.org/licenses/by-sa/3.0/ — Chinese labels loaded on demand
 */`
        if (!script) return
        const inject = (code: string): string =>
          code.replace(/(\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==\r?\n)/, `$1\n${attribution}\n`)
        if (script.type === 'asset' && typeof script.source === 'string') script.source = inject(script.source)
        if (script.type === 'chunk') script.code = inject(script.code)
      },
    },
  ],
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    target: ['safari16', 'chrome105', 'firefox102'],
    minify: false,
    cssMinify: false,
    sourcemap: false,
  },
})
