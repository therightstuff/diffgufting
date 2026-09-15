import { test } from 'node:test';
import assert from 'node:assert/strict';
import { settings } from '../src/core/settings.mjs';
import { EventEmitter } from 'node:events';
import { applyTheme, subscribeToAppearance } from '../src/desktop/theme.mjs';

test('settings accepts Device mode and rejects unsupported theme values', () => {
  assert.equal(settings({ theme: 'system' }).theme, 'system');
  assert.throws(() => settings({ theme: 'sepia' }), /Invalid theme/);
  assert.equal(settings().theme, 'dark');
});

test('Device publishes native changes while explicit themes remain fixed', () => {
  class FakeNativeTheme extends EventEmitter {
    constructor() { super(); this.shouldUseDarkColors = true; this.themeSource = 'system'; }
  }
  const nativeTheme = new FakeNativeTheme();
  let mode = 'system'; const appearances = [];
  assert.equal(applyTheme(nativeTheme, mode), 'dark');
  const stop = subscribeToAppearance(nativeTheme, () => mode, appearance => appearances.push(appearance));
  nativeTheme.shouldUseDarkColors = false; nativeTheme.emit('updated');
  assert.deepEqual(appearances, ['light']);
  mode = 'light'; assert.equal(applyTheme(nativeTheme, mode), 'light');
  nativeTheme.shouldUseDarkColors = true; nativeTheme.emit('updated');
  assert.deepEqual(appearances, ['light']);
  mode = 'system'; assert.equal(applyTheme(nativeTheme, mode), 'dark');
  nativeTheme.shouldUseDarkColors = false; nativeTheme.emit('updated');
  stop(); nativeTheme.shouldUseDarkColors = true; nativeTheme.emit('updated');
  assert.deepEqual(appearances, ['light', 'light']);
});
