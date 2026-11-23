// Runs in the quiz tab. This function must be self-contained for page.evaluate().
export function readQuestion() {
  const studentSite = location.protocol === 'https:' && (
    ['gosocrative.com', 'student.socrative.com'].includes(location.hostname) ||
    (location.hostname === 'b.socrative.com' && /^\/student(?:-v2)?(?:\/|$)/.test(location.pathname))
  );
  if (!studentSite) return null;

  const clean = (text) => (text ?? '').replace(/\s+/g, ' ').trim();
  const visible = (element) => element.getClientRects().length > 0 &&
    getComputedStyle(element).visibility === 'visible' &&
    !element.closest('[hidden], [aria-hidden="true"], [inert]');
  const textOf = (element) => clean(element.innerText);
  const control = 'button, [role="button"], a, input, select, textarea';
  const heading = 'h1, h2, h3, h4, [role="heading"]';
  const promptSelector = [
    '[data-testid="question-text"]', '[data-testid="question-prompt"]',
    '[data-testid="question-stem"]', '[data-testid="question-title"]',
    '.question-text', '.question-prompt', '.question-stem', '.question-title',
    '.questionText', '.questionPrompt', '#question-text',
  ].join(', ');
  const panelSelector = [
    '[data-question-id]', '[data-testid="question-content"]',
    '[data-testid="question-card"]', '.question-content', '.question-card',
  ].join(', ');
  const numberSelector = [
    '[data-testid="question-number"]', '[data-testid="question-counter"]',
    '[data-testid="current-question-number"]', '.question-number', '.questionNumber',
    '.question-counter', '.question-index', '.questionIndex',
  ].join(', ');
  const currentSelector = '[aria-current="step"], [aria-current="true"], [aria-current="page"], [aria-selected="true"]';
  const labeledNumber = /^(?:question\s*#?\s*)?([1-9]\d{0,4})\s*(?:of|\/)\s*([1-9]\d{0,4})(?:\s*[·•]\s*[a-z][a-z\s/&-]*)?$/i;
  const questionNumber = /^question\s*#?\s*([1-9]\d{0,4})\s*[:.]?$/i;
  const bareNumber = /^#?\s*([1-9]\d{0,4})[.:]?$/;
  const studentHeading = 'h2.text-muted-foreground.text-base.font-normal';

  // Use Socrative's displayed question heading ahead of pagination markers.
  const headings = [...document.querySelectorAll(studentHeading)]
    .filter(visible)
    .map((element) => ({ element, progress: textOf(element).match(labeledNumber) }))
    .filter(({ progress }) => progress && Number(progress[1]) <= Number(progress[2]));

  // Only treat a selected navigation control as a number if the control is numeric
  // or explicitly labelled as a question.
  const markers = headings.map(({ element, progress }) => ({
    element, number: Number(progress[1]), priority: 2,
  }));
  const fallbackMarkers = headings.length ? [] : document.querySelectorAll(
    `${numberSelector}, ${currentSelector}, ${heading}, span, p, div, strong`
  );
  for (const element of fallbackMarkers) {
    if (element.textContent.length > 120 || !visible(element)) continue;
    const isCurrent = element.matches(currentSelector);
    const isNumber = element.matches(numberSelector);
    if (!isCurrent && element.closest(control)) continue;
    // Text markers must stand alone. Matching a wrapper is unnecessary if its child
    // already contains the same text and will be checked on its own.
    if (!isNumber && !isCurrent && element.children.length === 1 &&
        textOf(element) === textOf(element.firstElementChild)) continue;

    const text = textOf(element);
    const progress = text.match(labeledNumber);
    const labeled = text.match(questionNumber);
    const accessible = isCurrent && clean(element.getAttribute('aria-label')).match(/^question\s+([1-9]\d{0,4})\b/i);
    const numeric = (isCurrent || isNumber) && text.match(bareNumber);
    const match = progress || labeled || numeric || accessible;
    if (!match || (progress && Number(progress[1]) > Number(progress[2]))) continue;
    const priority = isNumber || labeled || (progress && /^question\b/i.test(text)) ? 2 : isCurrent ? 1 : 0;
    markers.push({ element, number: Number(match[1]), priority });
  }
  markers.sort((a, b) => b.priority - a.priority);
  const best = markers[0];
  if (!best || markers.some((entry) =>
    entry.number !== best.number && (entry.priority > 0 || best.priority === 0)
  )) return null;
  const { element: marker, number } = best;

  const panel = marker.closest(panelSelector);
  const region = panel ?? marker.closest('main, [role="main"]') ??
    document.querySelector('main, [role="main"]') ?? document.body;
  const markerSection = marker.closest('header, aside');
  const explicitPrompts = [...region.querySelectorAll(promptSelector)].filter(visible);
  const possiblePrompts = explicitPrompts.length > 0
    ? explicitPrompts
    : [...region.querySelectorAll(`${heading}, p, div:not(:has(div, p, ${heading}))`)]
      .filter((element) => visible(element) && !element.closest(`nav, footer, ${control}`) &&
        (!element.closest('header, aside') || element.closest('header, aside') === markerSection) &&
        (element.contains(marker) ||
          Boolean(marker.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING)));
  const promptText = (element) => {
    const text = textOf(element);
    const prefix = textOf(marker);
    return element.contains(marker) && text.startsWith(prefix)
      ? text.slice(prefix.length).trim() : text;
  };
  const prompt = possiblePrompts.find((element) => {
    const text = promptText(element);
    return !marker.contains(element) && !element.closest('[aria-busy="true"], [role="status"]') &&
      !/^(?:loading(?: question)?[.…\s]*|multiple choice|true\s*(?:\/|or)\s*false|short answer|numeric)$/i.test(text) &&
      ((text && !labeledNumber.test(text) && !questionNumber.test(text) && !bareNumber.test(text)) ||
        element.querySelector('img, math, svg[aria-label]'));
  });
  if (!prompt) return { number, waitingFor: 'question body' };

  const questionPanel = prompt.closest(panelSelector);
  const images = [...(questionPanel ?? prompt).querySelectorAll('img')].filter(visible);
  if (images.some((image) => !image.complete)) return { number, waitingFor: 'question images' };
  const imageSources = images.map((image) => image.currentSrc || image.src);
  const identity = prompt.closest('[data-question-id]')?.getAttribute('data-question-id');
  const options = questionPanel && [...questionPanel.querySelectorAll(
    '[data-testid="answer-option"], .answer-option, [role="radio"], [role="checkbox"]'
  )].filter(visible).map(textOf);
  const content = JSON.stringify([identity, promptText(prompt), imageSources, options]);
  return { number, content };
}
