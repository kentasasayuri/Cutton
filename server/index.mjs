import { pathToFileURL } from 'node:url';
import { realpathSync } from 'node:fs';
import { createApp } from './app.mjs';

export { createApp } from './app.mjs';
export { createStore } from './store.mjs';

export async function startServer({ port = Number(process.env.CUTTON_PORT || process.env.YACHICUT_PORT || 4318), dataDir } = {}) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('YACHICUT_PORT must be an integer between 0 and 65535.');
  const app = await createApp({ dataDir });
  const server = await new Promise((resolve, reject) => { const listening = app.listen(port, '127.0.0.1', () => resolve(listening)); listening.on('error', reject); });
  server.on('close', () => app.locals.proxies?.close());
  return { app, server, store: app.locals.store, url: `http://127.0.0.1:${server.address().port}` };
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  startServer().then(({ app, server, url }) => {
    console.log(`Cutton: ${url} (local only)`);
    const stop = () => { app.locals.proxies?.close(); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 3000).unref(); };
    process.on('SIGINT', stop); process.on('SIGTERM', stop);
  }).catch((error) => { console.error(error.message); process.exitCode = 1; });
}
