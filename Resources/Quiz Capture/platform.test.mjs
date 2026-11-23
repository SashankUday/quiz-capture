import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { launchBrowser } from './browser.mjs';
import { watchQuiz } from './capture.mjs';
import { readMentiSlide } from './mentimeter.mjs';
import { parseXdgDesktop, screenshotRoot, validFolderName } from './paths.mjs';
import { readQuestion } from './question.mjs';

async function tempHome(t) {
  const home = await mkdtemp(join(tmpdir(), 'quiz-capture-platform-'));
  t.after(() => rm(home, { recursive: true, force: true }));
  return home;
}

test('uses an existing Desktop, falls back to home, and supports an absolute override', async (t) => {
  const home = await tempHome(t);
  const options = { home, env: {}, platform: 'darwin' };
  assert.equal(await screenshotRoot(options), join(home, 'Quiz Screenshots'));
  await mkdir(join(home, 'Desktop'));
  assert.equal(await screenshotRoot(options), join(home, 'Desktop', 'Quiz Screenshots'));
  const custom = join(home, 'Custom');
  assert.equal(await screenshotRoot({ ...options, env: { QUIZ_CAPTURE_SCREENSHOTS: custom } }), custom);
  await assert.rejects(screenshotRoot({ ...options, env: { QUIZ_CAPTURE_SCREENSHOTS: 'relative' } }), /absolute/);
});

test('uses a redirected XDG Desktop and reads user-dirs as data', async (t) => {
  const home = await tempHome(t);
  const config = join(home, 'desktop config');
  const desktop = join(home, 'Bureau partagé');
  await mkdir(config);
  await mkdir(desktop);
  await writeFile(join(config, 'user-dirs.dirs'), 'XDG_DESKTOP_DIR="$HOME/Bureau partagé" # desktop\n');
  assert.equal(await screenshotRoot({ platform: 'linux', home, env: { XDG_CONFIG_HOME: config } }),
    join(desktop, 'Quiz Screenshots'));
  assert.equal(parseXdgDesktop('XDG_DESKTOP_DIR="$HOME/$(touch file)"', home), home + '/$(touch file)');
  assert.equal(parseXdgDesktop('XDG_DESKTOP_DIR="$HOME/Bureau" # note', home), home + '/Bureau');
});

test('quiz names work across Windows, macOS and Linux', () => {
  for (const name of ['Lab Med', 'Révision 3', 'Case.1', 'COM10']) assert.equal(validFolderName(name), true, name);
  for (const name of ['', '.', '..', 'a/b', 'a\\b', 'a:b', 'a<', 'a>', 'a|', 'a?', 'a*', 'a"',
    'CON', 'lpt1.txt', 'AUX .doc', 'com¹', 'NUL.tmp', 'CONIN$', 'End.', 'End ', 'a\n', 'é'.repeat(128)]) {
    assert.equal(validFolderName(name), false, name);
  }
});

test('browser discovery prefers Chrome and falls back without turning off the sandbox', async () => {
  const calls = [];
  const managed = { name: 'managed browser' };
  const engine = { async launch(options) {
    calls.push(options);
    if (options.channel === 'chrome') throw new Error('Missing Chrome');
    return managed;
  } };
  assert.equal(await launchBrowser({ engine }), managed);
  assert.deepEqual(calls.map((call) => call.channel), ['chrome', 'chromium']);
  assert.ok(calls.every((call) => call.chromiumSandbox && !call.headless));
  await assert.rejects(launchBrowser({ engine: { async launch() { throw new Error('No usable sandbox'); } } }),
    /No usable sandbox/);
});

test('launching the CLI through a redirected directory still runs the entry point', async (t) => {
  const home = await tempHome(t);
  const redirected = join(home, 'Redirected App');
  const app = fileURLToPath(new URL('./', import.meta.url));
  await symlink(app, redirected, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(promisify(execFile)(process.execPath, [join(redirected, 'capture.mjs'), 'invalid-platform']),
    { code: 1, stderr: /Choose socrative or mentimeter/ });
});

test('real browser saves PNGs from Socrative and Mentimeter DOM fixtures', {
  skip: !process.env.QUIZ_CAPTURE_TEST_BROWSER,
}, async (t) => {
  const home = await tempHome(t);
  const channels = process.env.QUIZ_CAPTURE_TEST_BROWSER === 'chromium' ? ['chromium'] : undefined;
  const browser = await launchBrowser({ headless: !process.env.QUIZ_CAPTURE_TEST_HEADED, channels });
  t.after(() => browser.close());
  const fixtures = [
    ['https://b.socrative.com/student-v2/quiz', readQuestion,
      '<main><h2 class="text-muted-foreground text-base font-normal">Question 7 of 9 · Multiple Choice</h2><p>Which answer applies?</p></main>',
      '001-question-7.png'],
    ['https://www.menti.com/example', readMentiSlide,
      '<main><h1 data-testid="voting-title">Which answer applies?</h1><label>Option A</label><label>Option B</label></main>',
      '001-mentimeter.png'],
  ];
  for (const [url, reader, html, expected] of fixtures) {
    const page = await browser.newPage();
    const timeout = setTimeout(() => { void page.close().catch(() => {}); }, 10000);
    try {
      await page.route('**/*', (route) => route.fulfill({ contentType: 'text/html; charset=utf-8', body: html }));
      await page.goto(url);
      assert.ok((await page.evaluate(reader))?.content, 'The reader did not recognise the fixture at ' + url);
      const capture = await watchQuiz(page, {
        root: join(home, expected),
        reader,
        log(message) {
          if (message.startsWith('Saved ')) void page.close().catch(() => {});
        },
      });
      assert.ok(capture, 'The browser closed before saving a screenshot');
      assert.deepEqual(await readdir(capture), [expected]);
      const png = await readFile(join(capture, expected));
      assert.equal(png.subarray(1, 4).toString(), 'PNG');
    } finally {
      clearTimeout(timeout);
      await page.close();
    }
  }
});
