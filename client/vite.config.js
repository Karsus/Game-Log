import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  envDir: '../enviroments',
  plugins: [react()],
  server: {
    port: 5040,
    open: false,
    host: '127.0.0.1',
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:4050',
        changeOrigin: true,
      },
    },
  },
})
