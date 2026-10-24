import { mkdirSync } from 'node:fs';
import { createServer, type IncomingMessage } from 'node:http';
import { dirname } from 'node:path';
import { createApp } from './app';
import { openStore } from './store';

// Configuration comes from the environment; see the README's "Ratings server" section.
const env = process.env;

function required(name: string): string {
  const value = env[name]?.trim();
  if (!value) {
    console.error(`Set ${name} to start the ratings server.`);
    process.exit(1);
  }
  return value;
}

const port = Number(env.PORT) || 8787;
const dbPath = env.DB_PATH || 'data/cache.db';
/** Behind exactly one reverse proxy: the client's address is the last one it added. */
const trustProxy = env.TRUST_PROXY === '1' || env.TRUST_PROXY === 'true';

if (dbPath !== ':memory:') mkdirSync(dirname(dbPath), { recursive: true });
const store = openStore(dbPath);
const app = createApp({
  store,
  tmdbKey: required('TMDB_KEY'),
  omdbKey: required('OMDB_KEY'),
  omdbDailyLimit: Number(env.OMDB_DAILY_LIMIT) || 1000,
  rateLimitPerMin: Number(env.RATE_LIMIT_PER_MIN) || 300,
});

function clientIp(req: IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (trustProxy && typeof forwarded === 'string') {
    const last = forwarded.split(',').at(-1)?.trim();
    if (last) return last;
  }
  return req.socket.remoteAddress ?? '';
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  app
    .handle(new Request(url, { method: req.method }), clientIp(req))
    .then(async (response) => {
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
    })
    .catch((err: unknown) => {
      console.error(err);
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
});

// Often, so client addresses leave memory within minutes (see PRIVACY.md).
const housekeeping = setInterval(() => app.sweep(), 60_000);
housekeeping.unref();

server.listen(port, () => {
  console.log(`Popscore ratings server on port ${port} (cache: ${dbPath})`);
});

function shutdown() {
  clearInterval(housekeeping);
  server.close(() => {
    store.close();
    process.exit(0);
  });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
