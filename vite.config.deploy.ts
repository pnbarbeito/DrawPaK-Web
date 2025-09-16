import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

// Vite config for GitHub Pages deployment. Set `base` to the repository path before building.
// Replace '<USERNAME>' and '<REPO>' or set `GITHUB_REPOSITORY` in CI to auto-detect.
export default defineConfig(() => ({
  base: process.env.GH_PAGES_BASE ?? '/DrawPaK-Web/',
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) return 'vendor'
        }
      }
    }
  }
}))
