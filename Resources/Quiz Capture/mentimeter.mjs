// Runs in the participant tab. Keep this function self-contained for page.evaluate().
export function readMentiSlide() {
  if (location.protocol !== 'https:' || !['menti.com', 'www.menti.com'].includes(location.hostname)) {
    return null;
  }

  const visible = (element) => element.getClientRects().length > 0 &&
    getComputedStyle(element).visibility === 'visible' &&
    !element.closest('[hidden], [inert], [aria-hidden="true"]');
  const textOf = (element) => (element.innerText ?? '').replace(/\s+/g, ' ').trim();
  const title = [...document.querySelectorAll('main :is([data-testid="voting-title"], #slide-title)')]
    .find(visible);
  if (!title || title.closest('[aria-busy="true"]')) return null;

  // Use slide content and answer labels. Timers, selection state and results
  // messages can change while the participant is still on the same slide.
  const main = title.closest('main');
  const descriptions = [...main.querySelectorAll('[data-testid="voting-description"], #slide-description')]
    .filter(visible).map(textOf);
  const answers = [...main.querySelectorAll('label, [role="radio"], [role="checkbox"]')]
    .filter(visible).map(textOf).filter(Boolean);
  const images = [...main.querySelectorAll('img')].filter(visible);
  if (images.some((image) => !image.complete)) return null;
  const imageSources = images.map((image) => image.currentSrc || image.src);
  const prompt = textOf(title);
  if (!prompt && imageSources.length === 0) return null;
  return { content: JSON.stringify([location.pathname, prompt, descriptions, answers, imageSources]) };
}
