import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { chromium } from 'playwright';

const require = createRequire(import.meta.url);

export async function launchBrowser({
  headless = false, engine = chromium, channels = ['chrome', 'chromium'],
} = {}) {
  const failures = [];
  for (const channel of channels) {
    try {
      return await engine.launch({ channel, headless, chromiumSandbox: true, timeout: 15000 });
    } catch (error) {
      failures.push(error.message);
    }
  }
  const diagnostics = failures.map((failure, index) => {
    const lines = failure.split('\n');
    const relevant = lines.filter((line) =>
      /no usable sandbox|namespace sandbox|apparmor|missing dependencies|cannot open shared object|missing x server|\$display|sandbox_host/i.test(line));
    return [channels[index] + ': ' + lines[0], ...relevant.slice(0, 3)].join('\n');
  });
  throw new Error([
    'Could not start Chrome or Playwright Chromium.',
    ...diagnostics,
    process.platform === 'linux'
      ? 'Use a graphical desktop to capture quizzes. See the Linux troubleshooting instructions for system libraries and browser sandbox restrictions.'
      : 'Run the installer again to set up the browser.',
  ].join('\n'), { cause: failures });
}

export async function verifyBrowser(options = {}) {
  const browser = await launchBrowser({ ...options, headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent('<h1>Quiz Capture browser check</h1>');
    await page.screenshot({ type: 'png', timeout: 10000 });
    return browser.browserType().name();
  } finally {
    await browser.close();
  }
}

export function playwrightCommand(...args) {
  const cli = join(dirname(require.resolve('playwright/package.json')), 'cli.js');
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, ...args], { stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error('Playwright ' + args.join(' ') + ' failed (' + (signal ?? code) + ').'));
    });
  });
}

export async function provisionBrowser() {
  try {
    await verifyBrowser({ channels: ['chrome'] });
    return;
  } catch {
    // Chrome may be absent or unavailable under the account's browser policies.
  }
  const installed = await access(chromium.executablePath()).then(() => true, () => false);
  if (!installed) {
    console.log('Downloading Playwright Chromium…');
    await playwrightCommand('install', 'chromium', '--no-shell', '--no-remove');
  }
  await verifyBrowser({ channels: ['chromium'] });
}
