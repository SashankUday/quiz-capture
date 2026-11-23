import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { watchQuiz } from './capture.mjs';
import { readQuestion } from './question.mjs';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a/1sAAAAASUVORK5CYII=',
  'base64',
);

function fixture(samples) {
  let index = 0;
  const screenshots = [];
  return {
    screenshots,
    isClosed: () => index >= samples.length,
    evaluate: async () => samples[index++],
    screenshot: async () => {
      screenshots.push(samples[index - 1]);
      return png;
    },
  };
}

async function screenshotRoot(t) {
  const root = await mkdtemp(join(tmpdir(), 'quiz-capture-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

const options = { poll: 0, settle: 0, log: () => {} };
const seven = { number: 7, content: 'Question seven' };
const eight = { number: 8, content: 'Question eight' };
const nine = { number: 9, content: 'Question nine' };

test('reads the DOM on the live Student v2 route and skips unrelated pages', () => {
  for (const [url, expected] of [
    ['https://b.socrative.com/student-v2/quiz', true],
    ['https://b.socrative.com/student/', true],
    ['https://b.socrative.com/teacher/', false],
    ['https://example.com/student-v2/quiz', false],
  ]) {
    let queried = false;
    runInNewContext(`(${readQuestion.toString()})()`, {
      location: new URL(url),
      document: {
        querySelectorAll() {
          queried = true;
          return [];
        },
      },
    });
    assert.equal(queried, expected, url);
  }
});

test('captures the first question, waits for the new prompt, and captures a return visit', async (t) => {
  const root = await screenshotRoot(t);
  const numberAheadOfPrompt = { number: 8, content: seven.content };
  const sameQuestionAfterFeedback = { number: 7, content: 'Feedback rendered' };
  const page = fixture([
    null, null,
    seven, seven, seven,
    seven, sameQuestionAfterFeedback, sameQuestionAfterFeedback,
    numberAheadOfPrompt, numberAheadOfPrompt, numberAheadOfPrompt,
    eight, eight, eight,
    seven, seven, seven,
  ]);

  const folder = await watchQuiz(page, { ...options, root });
  const filenames = ['001-question-7.png', '002-question-8.png', '003-question-7.png'];
  assert.deepEqual((await readdir(folder)).sort(), filenames);
  assert.deepEqual(page.screenshots, [seven, eight, seven]);
  for (const filename of filenames) {
    assert.deepEqual(await readFile(join(folder, filename)), png);
  }

  const secondFolder = await watchQuiz(fixture([seven, seven, seven]), { ...options, root });
  assert.notEqual(secondFolder, folder);
  assert.deepEqual(await readdir(secondFolder), ['001-question-7.png']);
});

test('discards a screenshot if the question changes while the screenshot is taken', async (t) => {
  const root = await screenshotRoot(t);
  const page = fixture([seven, seven, seven, eight, eight, nine, nine, nine, nine]);
  const folder = await watchQuiz(page, { ...options, root });
  assert.deepEqual(page.screenshots, [seven, eight, nine]);
  assert.deepEqual((await readdir(folder)).sort(), ['001-question-7.png', '002-question-9.png']);
});

test('creates no run folder if the quiz window is closed before a question appears', async (t) => {
  const root = await screenshotRoot(t);
  assert.equal(await watchQuiz(fixture([null, null]), { ...options, root }), undefined);
  assert.deepEqual(await readdir(root), []);
});

test('captures unnumbered Mentimeter slides in order and ignores an interrupted capture', async (t) => {
  const root = await screenshotRoot(t);
  const first = { content: 'First slide' };
  const second = { content: 'Second slide' };
  const page = fixture([
    first, first, null,
    first, first, first, first,
    second, second, second,
    first, first, first,
  ]);
  const folder = await watchQuiz(page, { ...options, root });
  assert.deepEqual(page.screenshots, [first, first, second, first]);
  assert.deepEqual((await readdir(folder)).sort(), [
    '001-mentimeter.png', '002-mentimeter.png', '003-mentimeter.png',
  ]);
});

test('reports a detected heading while waiting for the question body', async (t) => {
  const root = await screenshotRoot(t);
  const waiting = { number: 7, waitingFor: 'question body' };
  const messages = [];
  const page = fixture([waiting, waiting, seven, seven, seven]);
  const folder = await watchQuiz(page, { ...options, root, log: (message) => messages.push(message) });
  assert.equal(messages.filter((message) => message.includes('Waiting for the question body')).length, 1);
  assert.deepEqual(await readdir(folder), ['001-question-7.png']);
});
