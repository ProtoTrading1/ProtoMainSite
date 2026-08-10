import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const readSource = (relativePath) => readFile(
  new URL(`../../${relativePath}`, import.meta.url),
  'utf8',
);

describe('customer journey prompt accessibility', () => {
  it('announces prompt copy without placing interactive controls inside the live region', async () => {
    const source = await readSource('src/components/CustomerJourneyPrompt.jsx');
    const announcementStart = source.indexOf('className="customer-journey-prompt__announcement"');
    const announcementEnd = source.indexOf('className="customer-journey-prompt__actions"');
    const announcement = source.slice(announcementStart, announcementEnd);

    assert.match(source, /role="region"/);
    assert.match(announcement, /role="status"/);
    assert.match(announcement, /aria-live="polite"/);
    assert.match(announcement, /aria-atomic="true"/);
    assert.doesNotMatch(announcement, /<button/);
    assert.ok(announcementStart >= 0 && announcementEnd > announcementStart);
  });

  it('keeps every prompt control at least 44 by 44 CSS pixels on mobile', async () => {
    const styles = await readSource('src/components/CustomerJourneyPrompt.css');

    assert.match(styles, /\.customer-journey-prompt__button\s*\{[\s\S]*?min-height:\s*44px;/);
    assert.match(styles, /\.customer-journey-prompt__close\s*\{[\s\S]*?width:\s*44px;[\s\S]*?height:\s*44px;/);
    assert.match(
      styles,
      /@media \(max-width: 600px\)[\s\S]*?\.customer-journey-prompt__close\s*\{[\s\S]*?min-width:\s*44px;[\s\S]*?min-height:\s*44px;/,
    );
  });

  it('clears the fixed mobile navigation and respects device safe areas', async () => {
    const styles = await readSource('src/components/CustomerJourneyPrompt.css');

    assert.match(styles, /--customer-journey-mobile-nav-height:\s*72px;/);
    assert.match(styles, /@media \(min-width: 601px\) and \(max-width: 900px\)/);
    assert.match(styles, /bottom:\s*calc\([\s\S]*?--customer-journey-mobile-nav-height[\s\S]*?env\(safe-area-inset-bottom, 0px\)/);
    assert.match(styles, /top:\s*calc\([\s\S]*?env\(safe-area-inset-top, 0px\)/);
    assert.match(styles, /max-height:\s*calc\([\s\S]*?100dvh[\s\S]*?safe-area-inset-top[\s\S]*?safe-area-inset-bottom/);
  });

  it('sits below interactive drawers and restores focus through persistent basket controls', async () => {
    const [prompt, styles, app, header] = await Promise.all([
      readSource('src/components/CustomerJourneyPrompt.jsx'),
      readSource('src/components/CustomerJourneyPrompt.css'),
      readSource('src/App.jsx'),
      readSource('src/components/Header.jsx'),
    ]);

    assert.match(styles, /z-index:\s*550;/);
    assert.match(prompt, /Close basket reminder and continue shopping/);
    assert.match(prompt, /event\.key !== 'Escape'/);
    assert.match(header, /data-cart-trigger="desktop"/);
    assert.match(header, /data-cart-trigger="mobile"/);
    assert.match(app, /closest\?\.\('\.customer-journey-prompt'\)/);
    assert.match(app, /data-cart-trigger="mobile"/);
  });

  it('retains reduced-motion handling for the prompt and timer', async () => {
    const styles = await readSource('src/components/CustomerJourneyPrompt.css');
    const reducedMotion = styles.slice(styles.indexOf('@media (prefers-reduced-motion: reduce)'));

    assert.match(reducedMotion, /\.customer-journey-prompt\s*\{\s*animation:\s*none;/);
    assert.match(reducedMotion, /\.customer-journey-prompt__timer\s*\{\s*animation:\s*none;/);
  });
});
