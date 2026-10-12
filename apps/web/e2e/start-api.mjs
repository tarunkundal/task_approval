// Starts the built API against the guarded test database on a given port:
//   node e2e/start-api.mjs <port> <frontend origin>
// Used by error-boundary.spec.ts, which needs an API it can start on its own (Playwright's CJS
// spec loader can't import test-env.mjs directly).
import { spawn } from 'node:child_process';
import { API_DIR, loadTestEnv } from './test-env.mjs';

const [port, frontendUrl] = process.argv.slice(2);
if (!port || !frontendUrl) {
  console.error('usage: node e2e/start-api.mjs <port> <frontend origin>');
  process.exit(2);
}

const child = spawn(process.execPath, ['dist/server.js'], {
  cwd: API_DIR,
  env: {
    ...process.env,
    ...loadTestEnv(),
    NODE_ENV: 'test',
    PORT: port,
    FRONTEND_URL: frontendUrl,
  },
  stdio: 'inherit',
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}
child.on('exit', (code) => process.exit(code ?? 0));
