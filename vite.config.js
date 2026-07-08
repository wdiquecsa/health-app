import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Served from https://<user>.github.io/health-app/
export default defineConfig({
  base: '/health-app/',
  plugins: [react()],
});
