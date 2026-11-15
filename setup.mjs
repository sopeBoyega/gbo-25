import { writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
const env = `NODE_ENV=development\nHOST=127.0.0.1\nPORT=3000\nAPP_ORIGIN=http://localhost:3000\nADMIN_PASSWORD=${randomBytes(24).toString('base64url')}\nRATE_SECRET=${randomBytes(32).toString('hex')}\nDATA_DIR=./data\nTRUST_PROXY=0\n`;
try {
  await writeFile(new URL('.env', import.meta.url), env, { flag: 'wx', mode: 0o600 });
  console.log('Created .env. Your private admin password is in that file. Run npm start.');
} catch (e) {
  if (e.code === 'EEXIST') console.log('.env already exists; preserved your settings.');
  else throw e;
}
