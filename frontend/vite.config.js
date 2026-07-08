import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Repo-root shared/criteria-data.json lives one level above this
    // package's own root, which Vite's dev-server fs guard blocks by default.
    fs: { allow: ['..'] },
  },
})
