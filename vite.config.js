import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import process from 'node:process'
import proof from './api/_archive-checkout-build-proof.js'
import { archiveCheckoutPanelContext } from './scripts/archive-checkout-panel-context.mjs'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: { 'import.meta.env.ARCHIVE_CHECKOUT_PANEL_CONTEXT': JSON.stringify(archiveCheckoutPanelContext(process.env, proof)) },
})
