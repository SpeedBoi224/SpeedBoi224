import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './src/server/app.js';
import { JsonFileStore } from './src/server/storage.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT) || 3000;
const dataFile = process.env.DATA_FILE || path.join(root, 'data', 'builds.json');

const app = createApp({
  store: new JsonFileStore(dataFile),
  publicDir: path.join(root, 'public'),
});

app.listen(port, () => {
  console.log(`moddingcars.com running at http://localhost:${port}`);
});
