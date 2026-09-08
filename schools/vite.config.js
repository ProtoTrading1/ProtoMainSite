import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Standalone school registration site. Deployed as its OWN Vercel project with
// Root Directory = `schools/`, so nothing here is bundled into the main portal.
export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: true },
});
