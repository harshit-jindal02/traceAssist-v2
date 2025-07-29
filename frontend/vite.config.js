import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // The server proxy is removed.
  // In a real deployment, an Ingress or similar gateway will handle routing.
})
