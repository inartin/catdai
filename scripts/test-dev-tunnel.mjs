// Exercise launcher lifecycle with fake services; no servers, tunnel, bank or SMTP calls.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const directory = await mkdtemp(join(tmpdir(), 'catdai-dev-tunnel-'));
const launcher = resolve('scripts/dev-tunnel.sh');
const stub = `#!${process.execPath}
const fs = require('node:fs');
const command = require('node:path').basename(process.argv[1]);
const args = process.argv.slice(2);
if (command === 'nc') process.exit(0);
const service = command === 'node' ? (args.some(arg => arg.includes('reconcile-maib')) ? 'worker' : 'next') : command;
const log = event => fs.appendFileSync(process.env.LAUNCHER_TEST_LOG, JSON.stringify({
  event, service, args, pid: process.pid, mode: process.env.NODE_ENV, bank: process.env.MAIB_ENVIRONMENT,
}) + '\\n');
log('start');
if (command === 'pnpm') process.exit(Number(process.env.LAUNCHER_TEST_BUILD_CODE || 0));
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => { log('stop'); process.exit(0); });
if (service === process.env.LAUNCHER_TEST_EXIT_SERVICE) setTimeout(() => process.exit(7), 250);
setInterval(() => {}, 1000);
`;

async function events(path) {
  return readFile(path, 'utf8').then(text => text.trim().split('\n').filter(Boolean).map(JSON.parse)).catch(error => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });
}

async function check(name, args, { signal = 'SIGTERM', exitService = '', buildCode = 0 } = {}) {
  const log = join(directory, `${name}.jsonl`);
  const child = spawn('bash', [launcher, ...args], {
    env: { ...process.env, PATH: `${directory}:${process.env.PATH}`, NODE_ENV: 'test', MAIB_ENVIRONMENT: 'sandbox',
      LAUNCHER_TEST_LOG: log, LAUNCHER_TEST_BUILD_CODE: String(buildCode), LAUNCHER_TEST_EXIT_SERVICE: exitService },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  const completion = once(child, 'close');
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); }, 5000);
  try {
    if (!buildCode && !exitService) {
      for (let attempt = 0; attempt < 150; attempt++) {
        const started = (await events(log)).filter(event => event.event === 'start' && event.service !== 'pnpm');
        if (started.length === 3) break;
        await delay(20);
      }
      child.kill(signal);
    }
    const [code] = await completion;
    assert.equal(timedOut, false, `${name}: launcher timed out\n${output}`);
    const started = (await events(log)).filter(event => event.event === 'start');
    const production = args[0] === 'prod';
    assert.ok(started.every(event => event.mode === (production ? 'production' : 'development')),
      `${name}: all services use the selected Next.js env`);
    assert.ok(started.every(event => event.bank === 'sandbox'), `${name}: bank environment is preserved`);
    if (buildCode) {
      assert.equal(code, buildCode);
      assert.deepEqual(started.map(event => event.service), ['pnpm'], 'failed builds start no services');
    } else {
      assert.equal(code, exitService ? 7 : signal === 'SIGINT' ? 130 : 143, output);
      const services = started.filter(event => event.service !== 'pnpm');
      assert.deepEqual(services.map(event => event.service).sort(), ['cloudflared', 'next', 'worker']);
      assert.deepEqual(services.find(event => event.service === 'worker').args,
        production ? ['scripts/reconcile-maib.mjs'] : ['--watch', '--watch-preserve-output', 'scripts/reconcile-maib.mjs']);
      assert.deepEqual(services.find(event => event.service === 'next').args,
        ['node_modules/next/dist/bin/next', production ? 'start' : 'dev']);
      assert.deepEqual(services.find(event => event.service === 'cloudflared').args,
        ['tunnel', 'run', args[1] || 'catdai']);
      for (const event of services) {
        assert.throws(() => process.kill(event.pid, 0), { code: 'ESRCH' }, `${name}: ${event.service} is stopped`);
      }
      if (production) assert.deepEqual(started[0].args, ['exec', 'next', 'build']);
    }
  } finally {
    clearTimeout(timer);
    child.kill('SIGTERM');
    for (const event of await events(log)) {
      if (event.event === 'start') {
        try { process.kill(event.pid, 'SIGTERM'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
      }
    }
    await completion;
  }
}

try {
  for (const command of ['node', 'pnpm', 'nc', 'cloudflared']) {
    await writeFile(join(directory, command), stub, { mode: 0o755 });
  }
  await check('default-test-command', []);
  await check('development-interrupt', ['dev', 'custom-tunnel'], { signal: 'SIGINT' });
  await check('production', ['prod']);
  await check('failed-build', ['prod'], { buildCode: 9 });
  for (const exitService of ['worker', 'cloudflared', 'next']) {
    await check(`${exitService}-exit`, ['dev'], { exitService });
  }
  const { scripts } = JSON.parse(await readFile('package.json', 'utf8'));
  assert.ok(scripts.stop.includes('bash scripts/dev-tunnel.sh'), 'pnpm stop signals the launcher for worker cleanup');
  console.log('Dev/test/prod launcher env, payment worker startup, service exits and signal cleanup passed.');
} finally {
  await rm(directory, { recursive: true, force: true });
}
