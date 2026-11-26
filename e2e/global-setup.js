import process from 'node:process';
import { createServer } from 'vite';

export default async function globalSetup() {
  const port = Number(process.env.PROTO_PLAYWRIGHT_PORT || 4173);

  // Keep synthetic authentication on the disposable local server so the E2E
  // suite never needs real Supabase credentials or production services.
  process.env.VITE_SUPABASE_URL = `http://127.0.0.1:${port}/mock-supabase`;
  process.env.VITE_SUPABASE_ANON_KEY = 'e2e-public-placeholder';
  process.env.VITE_INTERCOM_APP_ID = '';

  const server = await createServer({
    configLoader: 'runner',
    server: {
      host: '127.0.0.1',
      port,
      // Safety fixtures block WebSockets. Keep Vite's development client from
      // reconnecting or reloading the page during an isolated browser case.
      hmr: false,
      // Browser console/page errors stay available to Playwright; forwarding
      // them to Vite would require the deliberately blocked socket transport.
      forwardConsole: false,
      // Never switch to another local application when the requested isolated
      // port is occupied.
      strictPort: true,
    },
  });

  await server.listen();

  return async () => {
    await server.close();
  };
}
