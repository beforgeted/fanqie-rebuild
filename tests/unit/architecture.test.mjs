import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {filterState, profileWords} from '../../src/core/filters.mjs';
import {historyOperation} from '../../src/core/storage-operations.mjs';
import {createTextReader} from '../../src/adapters/fanqie/text-reader.mjs';
import {FONTS} from '../../src/adapters/fanqie/font-map.mjs';
import {JSDOM} from 'jsdom';
const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL('../../', import.meta.url));
const {outputs, moduleFiles} = require('../../scripts/build.cjs');

test('构建可重复，两种平台共享核心，发布权限未扩大', () => {
  const a = outputs(), b = outputs();
  assert.deepEqual(a, b);
  assert.ok(a['chrome-extension/content.js'].includes(a['fanqie-keyword-filter.user.js']));
  const manifest = JSON.parse(a['chrome-extension/manifest.json']);
  assert.deepEqual(manifest.permissions, ['storage']);
  assert.equal(manifest.host_permissions, undefined);
});

test('所有页面片段显式列入清单，不漏构建，不重复', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'src/app/runtime.json')));
  const all = fs.readdirSync(path.join(root, 'src'), {recursive: true}).filter(file => file.endsWith('.js'))
    .map(file => 'src/' + file.replaceAll('\\', '/'));
  const standalone = ['src/platform/chrome/adapter.js', 'src/platform/chrome/background.js'];
  assert.deepEqual([...manifest, ...standalone].sort(), all.sort());
  assert.equal(manifest.length, new Set(manifest).size);
  assert.equal(manifest.at(-1), 'src/app/bootstrap.js');
  const modules = fs.readdirSync(path.join(root, 'src'), {recursive: true}).filter(file => file.endsWith('.mjs'))
    .map(file => 'src/' + file.replaceAll('\\', '/'));
  assert.deepEqual([...moduleFiles].sort(), modules.sort());
});

test('核心存储可脱离浏览器与界面使用', async () => {
  const values = {};
  const storage = {all: async () => values, get: async key => values[key], set: async patch => Object.assign(values, patch)};
  const state = await historyOperation(storage, {action: 'filterRead'});
  assert.deepEqual(filterState(state), state);
  assert.ok(Array.isArray(profileWords(state.profiles[0])));
});

test('字体读取器使用所属文档，保留原字符映射行为', () => {
  const dom = new JSDOM('<div class="card"><span></span></div>');
  try {
    const [font, table] = Object.entries(FONTS)[0];
    const span = dom.window.document.querySelector('span');
    span.className = 'font-' + font;
    span.textContent = String.fromCodePoint(58344) + '普通文字';
    const readText = createTextReader({fonts: FONTS, cardSelector: '.card'});
    assert.equal(readText(span), (table[0] === '?' ? String.fromCodePoint(58344) : table[0]) + '普通文字');
    assert.equal(readText(null), '');
  } finally {dom.window.close();}
});
