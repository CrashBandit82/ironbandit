import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Versionsnummer kommt aus package.json (einzige Pflegestelle) und wird als
// __APP_VERSION__ in den Bundle kompiliert — siehe src/version.js.
const pkg = JSON.parse(
  readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf-8')
)

// public/sw.js wird unverändert nach dist kopiert — `define` greift dort nicht
// (der Service Worker ist kein Bundle-Modul). Deshalb den Platzhalter nach dem
// Build direkt in dist/sw.js ersetzen und zusätzlich dist/version.json
// schreiben (Server-Sicht auf die deployte Version, z.B. für curl-Checks).
function versionStamp(version) {
  let outDir
  return {
    name: 'ironbandit-version-stamp',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir)
    },
    // closeBundle läuft, nachdem Vite publicDir nach dist kopiert hat.
    closeBundle() {
      const swPath = resolve(outDir, 'sw.js')
      if (existsSync(swPath)) {
        const stamped = readFileSync(swPath, 'utf-8').split('__APP_VERSION__').join(version)
        writeFileSync(swPath, stamped)
      } else {
        this.warn('sw.js nicht in dist gefunden — Update-Erkennung stempelt keine Version')
      }
      writeFileSync(
        resolve(outDir, 'version.json'),
        JSON.stringify({ version, builtAt: new Date().toISOString() }) + '\n'
      )
    },
  }
}

export default defineConfig({
  plugins: [react(), versionStamp(pkg.version)],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true
      }
    },
    host: '0.0.0.0',
    port: 5173
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    minify: 'terser',
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
        },
      },
    },
  }
})
