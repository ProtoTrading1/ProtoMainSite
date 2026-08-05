import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const readSource = (relativePath) => readFile(new URL(`../../${relativePath}`, import.meta.url), 'utf8');

describe('catalogue interaction accessibility', () => {
  it('does not render closed desktop cart controls into the keyboard order', async () => {
    const source = await readSource('src/App.jsx');
    assert.match(source, /desktopDrawerVisible && <Drawer/);
    assert.match(source, /aria-hidden=\{!desktopDrawerVisible\}/);
    assert.match(source, /restoreCartTriggerFocus/);
  });

  it('uses deliberate hover intent and explicit keyboard flyout opening', async () => {
    const sidebar = await readSource('src/components/Sidebar.jsx');
    const categoryNav = await readSource('src/components/CategoryNav.jsx');
    assert.match(sidebar, /MENU_HOVER_INTENT_MS = 100/);
    assert.match(categoryNav, /onMouseEnter=\{\(e\) => onHoverL1/);
    assert.match(categoryNav, /e\.key === 'ArrowRight'/);
    assert.doesNotMatch(categoryNav, /onFocus=\{\(e\) => onToggleL1/);
  });

  it('keeps department navigation usable while catalogue counts load', async () => {
    const categoryNav = await readSource('src/components/CategoryNav.jsx');
    assert.match(categoryNav, /const visibleCategories = countsReady/);
    assert.match(categoryNav, /: cats;/);
    assert.match(categoryNav, /aria-busy=\{!countsReady\}/);
    assert.doesNotMatch(categoryNav, /cat-nav-list--loading/);
  });

  it('gives cart icon controls contextual accessible names', async () => {
    const source = await readSource('src/components/Drawer.jsx');
    assert.match(source, /aria-label="Close cart"/);
    assert.match(source, /aria-label=\{`Remove \$\{item\.product\.name\} from cart`\}/);
  });

  it('keeps the basket preview open while the customer is using it', async () => {
    const source = await readSource('src/App.jsx');
    const styles = await readSource('src/index.css');
    assert.match(source, /const DRAWER_PEEK_MS = 1200/);
    assert.match(source, /const pauseDrawerPeek = useCallback/);
    assert.match(source, /const resumeDrawerPeek = useCallback/);
    assert.match(source, /onMouseEnter=\{pauseDrawerPeek\}/);
    assert.match(source, /onMouseLeave=\{resumeDrawerPeek\}/);
    assert.match(styles, /transition: transform 0\.16s/);
  });

  it('dismisses the welcome banner quickly and does not restore it during the session', async () => {
    const app = await readSource('src/App.jsx');
    const styles = await readSource('src/index.css');
    assert.match(app, /const WELCOME_DISPLAY_MS = 5500/);
    assert.match(app, /window\.setTimeout\(dismissWelcome, WELCOME_DISPLAY_MS\)/);
    assert.match(app, /onMouseEnter=\{dismissWelcome\}/);
    assert.match(app, /onScroll=\{dismissWelcome\}/);
    assert.doesNotMatch(app, /sessionStorage\.removeItem\(WELCOME_DISMISSED_KEY\)/);
    assert.doesNotMatch(app, /setShowWelcome\(true\)/);
    assert.match(styles, /animation: welcome-banner-brief 3\.5s ease forwards/);
    assert.match(styles, /85\.7%/);
    assert.match(styles, /max-height: 560px/);
    assert.match(styles, /pointer-events: none/);
  });
});
