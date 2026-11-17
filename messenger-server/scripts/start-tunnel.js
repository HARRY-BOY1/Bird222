const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const port = Number(process.env.PORT) || 3001;
const clientOrigin = process.argv.find((arg) => arg.startsWith('--client-origin='))?.slice('--client-origin='.length);
let server;
let tunnel;
let shuttingDown = false;

function stop() {
  if (shuttingDown) return;
  shuttingDown = true;
  if (tunnel && tunnel.exitCode === null) tunnel.kill('SIGINT');
  if (server && server.exitCode === null) server.kill('SIGINT');
}

function checkCloudflared() {
  const result = spawnSync('cloudflared', ['--version'], { stdio: 'ignore', timeout: 5000 });
  if (!result.error && result.status === 0) return;
  console.error('cloudflared is not installed or is not available in PATH.');
  console.error('Install it using Cloudflare\'s official instructions: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/get-started/');
  process.exit(1);
}

function waitForHealth() {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + 20000;
    const check = () => {
      const request = http.get({ hostname: 'localhost', port, path: '/health', timeout: 2000 }, (response) => {
        response.resume();
        if (response.statusCode === 200) return resolve();
        retry();
      });
      request.on('error', retry);
      request.on('timeout', () => request.destroy());
    };
    const retry = () => {
      if (Date.now() >= deadline) return reject(new Error(`Server did not become healthy at http://localhost:${port}/health within 20 seconds.`));
      setTimeout(check, 250);
    };
    check();
  });
}

function startTunnel() {
  return new Promise((resolve, reject) => {
    tunnel = spawn('cloudflared', ['tunnel', '--url', `http://localhost:${port}`], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    const timeout = setTimeout(() => reject(new Error('Could not find a trycloudflare.com URL within 30 seconds.')), 30000);
    const readOutput = (chunk) => {
      process.stdout.write(chunk);
      output += chunk.toString();
      const lines = output.split(/\r?\n/);
      output = lines.pop();
      for (const line of lines) {
        if (!line.includes('https://') || !line.includes('trycloudflare.com')) continue;
        const publicUrl = line.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i)?.[0];
        if (publicUrl) {
          clearTimeout(timeout);
          resolve(publicUrl);
          return;
        }
      }
    };
    tunnel.stdout.on('data', readOutput);
    tunnel.stderr.on('data', readOutput);
    tunnel.once('error', (error) => {
      clearTimeout(timeout);
      reject(new Error(`Could not start cloudflared: ${error.message}`));
    });
    tunnel.once('exit', (code) => {
      if (!shuttingDown) {
        clearTimeout(timeout);
        reject(new Error(`cloudflared exited before publishing a URL (code ${code}).`));
      }
    });
  });
}

function printConfiguration(publicUrl) {
  console.log('\n========================================');
  console.log(`Public URL: ${publicUrl}`);
  console.log('\nPaste this into messenger-client/config.js (do not commit a temporary URL):');
  console.log(`const SERVER_URL = '${publicUrl}';`);

  const envPath = path.join(root, '.env');
  const hasCors = fs.existsSync(envPath) && /^CORS_ORIGIN=/m.test(fs.readFileSync(envPath, 'utf8'));
  if (hasCors || clientOrigin) {
    console.log('\nCORS was not changed automatically. Copy this into messenger-server/.env:');
    console.log(`CORS_ORIGIN=${clientOrigin || '<client-origin>'}`);
    if (!clientOrigin) console.log('Replace <client-origin> with the exact origin of the page, including scheme and port; or use --client-origin=https://your-client.example.');
    if (hasCors) console.log('CORS_ORIGIN already exists: preserve any other origins you still need by adding them as a comma-separated list.');
    console.log('Restart the server after changing CORS_ORIGIN.');
  }
  console.log('\nQuick tunnel URLs change every run. The server is publicly reachable while this command is running.');
  console.log('Press Ctrl+C to stop both the tunnel and the server.');
  console.log('========================================');
}

async function main() {
  checkCloudflared();
  console.log(`Starting the messaging server on port ${port}...`);
  server = spawn(process.execPath, ['src/index.js'], { cwd: root, stdio: 'inherit' });
  server.once('error', (error) => {
    console.error(`Could not start the server: ${error.message}`);
    stop();
    process.exit(1);
  });
  server.once('exit', (code) => {
    if (!shuttingDown) {
      console.error(`The server exited (code ${code}).`);
      stop();
      process.exit(code || 1);
    }
  });
  await waitForHealth();
  console.log('Server is healthy. Starting the Cloudflare quick tunnel...');
  const publicUrl = await startTunnel();
  printConfiguration(publicUrl);
}

process.on('SIGINT', () => {
  stop();
  setTimeout(() => process.exit(0), 1500).unref();
});
process.on('SIGTERM', () => {
  stop();
  process.exit(0);
});

main().catch((error) => {
  console.error(`Tunnel startup failed: ${error.message}`);
  stop();
  setTimeout(() => process.exit(1), 500).unref();
});
