import { loadConfig } from './config.js';
import { loadDotEnv } from './lib/env-loader.js';
import { createServer } from './app.js';
import { createDataClient } from './data-client.js';

loadDotEnv();

const config = loadConfig();
const server = createServer(config, createDataClient(config));

function shutdown(signal) {
  console.log(`${signal} received, shutting down gracefully`);
  server.close((error) => {
    if (error) {
      console.error('Failed to close HTTP server', error);
      process.exit(1);
    }

    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

server.listen(config.port, config.host, () => {
  console.log(`Sage connector listening on http://${config.host}:${config.port}`);
});
