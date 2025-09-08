import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
  ],
  build: {
  // Raise the chunk size warning limit to 700 kB
  chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        // Split big vendor chunks. Keep sensible groups for React + libs, heavy libs separate.
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom') || id.includes('reactflow')) {
              return 'vendor_react'
            }
            if (id.includes('material') || id.includes('@mui')) {
              return 'vendor_mui'
            }
            if (id.includes('html-to-image') || id.includes('html2canvas') || id.includes('jspdf')) {
              return 'vendor_exporters'
            }
            return 'vendor_misc'
          }
        }
      }
    }
  }
})
