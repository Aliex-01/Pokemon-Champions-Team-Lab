import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    exclude: ['@pkmn/mods/champions'],
  },
  build: {
    rollupOptions: {
      output: {
        // React y el router cambian poco: en su propio chunk se cachean
        // entre despliegues aunque cambie el código de la app.
        manualChunks(id) {
          if (id.includes('node_modules/react') || id.includes('node_modules/scheduler')) {
            return 'react-vendor';
          }
        },
      },
    },
  },
})
