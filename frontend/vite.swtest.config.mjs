// Temporäre Build-Config für den SW-Update-Harness (swtest.html).
// Erbt Plugins (inkl. Version-Stempel für sw.js) von der Haupt-Config.
import { defineConfig } from 'vite'
import base from './vite.config.js'

export default defineConfig({
  ...base,
  build: {
    ...base.build,
    outDir: process.env.SWTEST_OUT || 'dist-swtest',
    emptyOutDir: true,
    rollupOptions: {
      ...base.build.rollupOptions,
      input: { swtest: 'swtest.html' },
    },
  },
})
