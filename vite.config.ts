import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // Served from https://<org>.github.io/rdf-visualizer/ on GitHub Pages
  base: '/rdf-visualizer/',
  plugins: [react()],
})
