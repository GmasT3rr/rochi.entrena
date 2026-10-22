import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const script = readFileSync(new URL('../public/theme-init.js', import.meta.url), 'utf8');
for (const [stored, dark, expected] of [
  ['dark', false, 'dark'],
  ['light', true, 'light'],
  ['system', true, 'dark'],
  ['invalid', false, 'light'],
  [null, true, 'dark'],
]) {
  test(`tema inicial ${stored}, sistema oscuro ${dark}`, () => {
    const root = { dataset: {} };
    runInNewContext(script, {
      document: { documentElement: root },
      localStorage: { getItem: () => stored },
      matchMedia: () => ({ matches: dark }),
    });
    assert.equal(root.dataset.theme, expected);
  });
}
test('el arranque tolera preferencias bloqueadas', () => {
  const root = { dataset: {} };
  runInNewContext(script, {
    document: { documentElement: root },
    localStorage: {
      getItem() {
        throw Error('blocked');
      },
    },
  });
  assert.equal(root.dataset.theme, 'light');
});
