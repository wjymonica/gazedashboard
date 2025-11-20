import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const backendUrlEnv = process.env.BACKEND_URL
const backendHost = process.env.BACKEND_HOST || 'localhost'
const backendPortRaw = process.env.BACKEND_PORT
const backendPort = backendPortRaw && backendPortRaw.trim() !== '' ? backendPortRaw.trim() : '5051'
const backendProto = process.env.BACKEND_PROTO || ((backendPort === '443') ? 'https' : 'http')
const portPart = backendPort && backendPort !== '443' && backendPort !== '80' ? `:${backendPort}` : ''
const targetUrl = backendUrlEnv && backendUrlEnv.trim().length > 0
  ? backendUrlEnv.trim()
  : `${backendProto}://${backendHost}${portPart}`

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5052',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})


