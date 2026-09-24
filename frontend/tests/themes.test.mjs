import assert from 'node:assert/strict';
import test from 'node:test';
import { availableThemes, resolveTheme, themeStorageKey } from '../src/themes.js';

test('each session starts with its own default and stores a separate choice', () => {
  assert.equal(resolveTheme('', null).id, 'dark');
  assert.equal(resolveTheme('awc', null).id, 'signet');
  assert.equal(resolveTheme('awc', 'book1').id, 'signet');
  assert.equal(resolveTheme('', 'hogwarts').id, 'castle-torchlit');
  assert.equal(resolveTheme('', 'four-houses').id, 'castle-torchlit');
  assert.notEqual(themeStorageKey(''), themeStorageKey('awc'));
});

test('every session can use every theme in its Standard or Fantasy group', () => {
  const themeIds = ['dark', 'light', 'signet', 'castle-torchlit'];
  for (const roomId of ['', 'awc', 'future-room']) {
    assert.deepEqual(availableThemes(roomId).map(({ id }) => id), themeIds);
    assert.equal(resolveTheme(roomId, 'castle-torchlit').id, 'castle-torchlit');
  }
  assert.deepEqual(availableThemes().map(({ group }) => group), ['Standard', 'Standard', 'Fantasy', 'Fantasy']);
});

test('only the fantasy themes provide a wand cursor effect', () => {
  assert.deepEqual(availableThemes().map(({ cursorEffect }) => cursorEffect ?? null), [null, null, 'wand', 'wand']);
});
