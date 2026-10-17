import net from 'node:net';
import { spawn } from 'node:child_process';
import process from 'node:process';

const preferredPorts = [];
const explicitPort = Number(process.env.PORT || process.env.PPCA_PORT || 0);
if (Number.isInteger(explicitPort) && explicitPort >= 1024 && explicitPort <= 65535) preferredPorts.push(explicitPort);
for (const p of [3010, 3000, ...Array.from({ length: 31 }, (_, i) => 3001 + i)]) {
  if (!preferredPorts.includes(p)) preferredPorts.push(p);
}

function canBind(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port);
  });
}

async function existingProject(port) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(450) });
    if (!response.ok) return false;
    const html = await response.text();
    return /Pay Per Call Agent|AI agents.*Pay per call|New to Pay Per Call Agent/i.test(html);
  } catch {
    return false;
  }
}

for (const port of preferredPorts) {
  const available = await canBind(port);
  if (!available && await existingProject(port)) {
    console.log(`\nPay Per Call Agent is already running at http://localhost:${port}`);
    console.log('No second server was started (avoids EADDRINUSE). Open that URL in your browser.');
    console.log('\nFor Stripe TEST webhooks, use a second Terminal window:');
    console.log(`npx @stripe/cli listen --events checkout.session.completed --forward-to localhost:${port}/api/webhooks/stripe`);
    process.exit(0);
  }
}

let chosenPort;
for (const port of preferredPorts) {
  if (await canBind(port)) {
    chosenPort = port;
    break;
  }
}
if (!chosenPort) {
  console.error('No free local port found between the selected port and 3032. Stop an old development server or set PORT=3011.');
  process.exit(1);
}

const baseUrl = `http://localhost:${chosenPort}`;
console.log(`\nStarting Pay Per Call Agent at ${baseUrl}`);
console.log('Keep this Terminal open while using the app.');
console.log('\nIf you use Stripe TEST Checkout, start a second Terminal with:');
console.log(`npx @stripe/cli listen --events checkout.session.completed --forward-to localhost:${chosenPort}/api/webhooks/stripe`);
console.log('Set the matching whsec_ value in .env.local and restart this server after changing environment variables.\n');

const nextBin = new URL('../node_modules/next/dist/bin/next', import.meta.url);
const child = spawn(process.execPath, [nextBin.pathname, 'dev', '-p', String(chosenPort)], {
  cwd: process.cwd(),
  stdio: 'inherit',
  env: { ...process.env, APP_BASE_URL: baseUrl },
});
child.on('error', (error) => {
  console.error('Could not start Next.js:', error.message);
  process.exitCode = 1;
});
child.on('exit', (code, signal) => {
  process.exitCode = signal ? 1 : (code ?? 1);
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}
