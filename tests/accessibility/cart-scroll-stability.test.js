import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

describe('basket scroll stability', () => {
  it('preserves the current line while quantity changes and scrolls only for a new product line', async () => {
    const source = await readFile(new URL('../../src/components/Drawer.jsx', import.meta.url), 'utf8');

    assert.match(source, /previousItemIdsRef = useRef/);
    assert.match(source, /const hasNewLine = cartItems\.some/);
    assert.match(source, /if \(!el \|\| !hasNewLine \|\| previousItemIds\.size === 0\) return/);
    assert.match(source, /el\.scrollTo\(\{ top: el\.scrollHeight, behavior: 'smooth' \}\)/);
    assert.doesNotMatch(source, /if \(!el \|\| !cartItems\.length\) return/);
  });
});
