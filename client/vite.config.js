import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const envDir = fileURLToPath(new URL('../enviroments', import.meta.url))
  const env = loadEnv(mode, envDir, 'SITE_URL')
  const siteUrl = new URL(env.SITE_URL || 'http://localhost:5040')

  return {
    envDir,
    plugins: [react()],
    server: {
      port: Number(siteUrl.port || 5040),
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
  }
})
