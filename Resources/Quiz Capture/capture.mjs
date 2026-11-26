import { mkdir, mkdtemp, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import { launchBrowser, verifyBrowser } from './browser.mjs';
import { screenshotRoot, validFolderName } from './paths.mjs';
import { readQuestion } from './question.mjs';
import { readMentiSlide } from './mentimeter.mjs';

const platforms = {
  socrative: { url: 'https://gosocrative.com/', reader: readQuestion },
  mentimeter: { url: 'https://www.menti.com/', reader: readMentiSlide },
};
const pollInterval = 125;
const settleTime = 250;

export async function watchQuiz(page, {
  root,
  reader = readQuestion,
  poll = pollInterval,
  settle = settleTime,
  log = console.log,
  bodyFallback = 2000,
} = {}) {
  let lastSaved;
  let candidate;
  let candidateSince = 0;
  let sequence = 1;
  let directory;
  let reportedWait;
  let bodyWait;

  // If the question number is visible but its text cannot be found (for example
  // after a Socrative layout change), save the page anyway after a short wait.
  function withFallback(question) {
    if (question?.waitingFor !== 'question body') {
      bodyWait = undefined;
      return question;
    }
    if (bodyWait?.number !== question.number) bodyWait = { number: question.number, since: performance.now() };
    if (performance.now() - bodyWait.since < bodyFallback) return question;
    return { number: question.number, content: `unread-question-${question.number}` };
  }

  async function sample() {
    try {
      return withFallback(await page.evaluate(reader));
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
            root ??= await screenshotRoot();
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

async function chooseScreenshotRoot(screenshotsRoot) {
  if (!process.stdin.isTTY) return screenshotsRoot;

  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  try {
    while (true) {
      const folder = (await terminal.question('Quiz folder name (Return for a timestamped folder): ')).trim();
      if (!folder) return screenshotsRoot;
      if (validFolderName(folder)) {
        return join(screenshotsRoot, folder);
      }
      console.log('Enter a single folder name, such as Lab Med Endocrinology.');
    }
  } finally {
    terminal.close();
  }
}

async function main() {
  if (process.argv[2] === '--verify') {
    await verifyBrowser();
    console.log('Quiz Capture browser verification passed.');
    return;
  }
  const { url, reader } = await choosePlatform();
  const root = await chooseScreenshotRoot(await screenshotRoot());
  console.log(`This run will save its screenshots in a new folder under ${root}`);
  const browser = await launchBrowser();
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

async function isMain() {
  if (typeof import.meta.main === 'boolean') return import.meta.main;
  // Older Node releases lack import.meta.main. Resolve both names so symlinked
  // and Windows short paths can still identify the CLI entry point.
  if (!process.argv[1]) return false;
  const entry = await realpath(process.argv[1]).catch(() => null);
  const source = await realpath(new URL(import.meta.url));
  return entry !== null && entry === source;
}

if (await isMain()) {
  main().catch((error) => {
    console.error(`Quiz Capture stopped. ${error.message}`);
    process.exitCode = 1;
  });
}
