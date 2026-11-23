import { access, mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { readQuestion } from './question.mjs';
import { readMentiSlide } from './mentimeter.mjs';

const platforms = {
  socrative: { url: 'https://gosocrative.com/', reader: readQuestion },
  mentimeter: { url: 'https://www.menti.com/', reader: readMentiSlide },
};
const chromeExecutable = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const screenshotsRoot = join(homedir(), 'Desktop', 'Quiz Screenshots');
const pollInterval = 125;
const settleTime = 250;

async function exists(path) {
  return access(path).then(() => true, () => false);
}

async function browserOptions() {
  const options = { headless: false, chromiumSandbox: true };
  if (await exists(chromium.executablePath())) return options;
  if (await exists(chromeExecutable)) return { ...options, channel: 'chrome' };
  throw new Error('Chromium is missing. Run Start Quiz Capture.command to install it.');
}

export async function watchQuiz(page, {
  root = screenshotsRoot,
  reader = readQuestion,
  poll = pollInterval,
  settle = settleTime,
  log = console.log,
} = {}) {
  let lastSaved;
  let candidate;
  let candidateSince = 0;
  let sequence = 1;
  let directory;
  let reportedWait;

  async function sample() {
    try {
      return await page.evaluate(reader);
    } catch (error) {
      // The quiz can replace the document between two polls.
      if (page.isClosed() || /Execution context was destroyed|Cannot find context with specified id/.test(error.message)) {
        return null;
      }
      throw error;
    }
  }

  while (!page.isClosed()) {
    const question = await sample();
    if (question?.waitingFor) {
      const message = `Question ${question.number} detected. Waiting for the ${question.waitingFor}.`;
      if (message !== reportedWait) log(message);
      reportedWait = message;
    }
    const sameNumber = question?.number != null && question.number === lastSaved?.number;
    if (!question?.content || sameNumber || question.content === lastSaved?.content) {
      candidate = undefined;
    } else if (question.number !== candidate?.number || question.content !== candidate?.content) {
      candidate = question;
      candidateSince = performance.now();
    } else if (performance.now() - candidateSince >= settle) {
      let png;
      try {
        png = await page.screenshot({ type: 'png', timeout: 2500 });
      } catch (error) {
        if (page.isClosed()) break;
        if (error.name !== 'TimeoutError') throw error;
        candidate = undefined;
      }

      if (png) {
        const after = await sample();
        if (after?.number === question.number && after?.content === question.content) {
          if (!directory) {
            await mkdir(root, { recursive: true });
            const started = new Date().toISOString().replace(/[:.]/g, '-');
            directory = await mkdtemp(join(root, `${started}-`));
            log(`Saving screenshots in ${directory}`);
          }
          const label = question.number == null ? 'mentimeter' : `question-${question.number}`;
          const filename = `${String(sequence).padStart(3, '0')}-${label}.png`;
          const temporaryPath = join(directory, '.capture.tmp');
          try {
            await writeFile(temporaryPath, png, { mode: 0o600, flag: 'wx' });
            await rename(temporaryPath, join(directory, filename));
          } catch (error) {
            await rm(temporaryPath, { force: true }).catch(() => {});
            throw error;
          }
          lastSaved = question;
          sequence++;
          log(`Saved ${filename}`);
        }
        candidate = undefined;
      }
    }
    await sleep(poll);
  }

  if (directory) log(`Capture finished. Screenshots are in ${directory}`);
  else log('Capture finished. No question screenshots were saved.');
  return directory;
}

async function choosePlatform() {
  const requested = process.argv[2]?.toLowerCase();
  if (requested) {
    if (!Object.hasOwn(platforms, requested)) throw new Error('Choose socrative or mentimeter.');
    return platforms[requested];
  }
  if (!process.stdin.isTTY) return platforms.socrative;

  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  try {
    while (true) {
      const choice = (await terminal.question('Quiz platform [1] Socrative (default), [2] Mentimeter: ')).trim();
      if (!choice || choice === '1') return platforms.socrative;
      if (choice === '2') return platforms.mentimeter;
      console.log('Enter 1 for Socrative or 2 for Mentimeter.');
    }
  } finally {
    terminal.close();
  }
}

async function chooseScreenshotRoot() {
  if (!process.stdin.isTTY) return screenshotsRoot;

  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  try {
    while (true) {
      const folder = (await terminal.question('Quiz folder name (Return for a timestamped folder): ')).trim();
      if (!folder) return screenshotsRoot;
      if (folder !== '.' && folder !== '..' && !/[\\/:\x00-\x1f\x7f]/.test(folder) &&
          Buffer.byteLength(folder) <= 255) {
        return join(screenshotsRoot, folder);
      }
      console.log('Enter a single folder name, such as Lab Med Endocrinology.');
    }
  } finally {
    terminal.close();
  }
}

async function main() {
  const { url, reader } = await choosePlatform();
  const root = await chooseScreenshotRoot();
  console.log(`This run will save its screenshots in a new folder under ${root}`);
  const browser = await chromium.launch(await browserOptions());
  try {
    const page = await browser.newPage({ viewport: null, locale: 'en-GB' });
    page.on('crash', () => page.close().catch(() => {}));
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    console.log('Join your quiz in the browser. Close the quiz window to stop capture.');
    await watchQuiz(page, { root, reader });
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    const summary = error.message.split('\n')[0];
    console.error(`Quiz Capture stopped. ${summary}`);
    process.exitCode = 1;
  });
}
