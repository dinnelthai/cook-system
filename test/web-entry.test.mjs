import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('home page loads the application module from the permitted web directory', async () => {
  const html = await readFile(new URL('../web/index.html', import.meta.url), 'utf8');
  const src = html.match(/<script\s+type="module"\s+src="([^"]+)"/)[1];
  assert.equal(new URL(src, 'http://127.0.0.1:4173/').pathname, '/web/app.mjs');
  assert.equal(new URL(src, 'http://127.0.0.1:4173/web/index.html').pathname, '/web/app.mjs');
});
