import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        // รองรับ APK upload ขนาดใหญ่ + adb install ที่ใช้เวลานาน
        timeout: 300000,        // 5 นาที (ms) — client → proxy
        proxyTimeout: 300000,   // 5 นาที (ms) — proxy → backend
      }
    }
  }
})
