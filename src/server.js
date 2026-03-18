import { loadConfig } from './config.js';
import { createServer } from './app.js';

const config = loadConfig();
const server = createServer(config);

server.listen(config.port, config.host, () => {
  console.log(`Sage connector listening on http://${config.host}:${config.port}`);
});
