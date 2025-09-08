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
            return 'vendor'; // All node_modules in a single chunk
          }
        }
      }
    }
  }
})
