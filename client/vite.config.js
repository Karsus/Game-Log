import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  envDir: '../enviroments',
  plugins: [react()],
  server: {
    port: 5040,
    open: true,
    proxy: {
      '/api': {
        target: 'http://localhost:4050',
        changeOrigin: true,
      },
    },
  },
})
