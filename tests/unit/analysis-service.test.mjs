import test from 'node:test';
import assert from 'node:assert/strict';
import {createBookAnalysisService} from '../../src/services/analysis-service.mjs';

const id = '1234567890123456789';
const book = {title: '荒野生活', author: '测试作者', abstract: '在荒野建造住所。', meta: '连载中 · 科幻',
  cookie: 'private', note: 'private', accountId: 'private', state: 'later'};
const answer = () => ({summary: '简介提到建造住所。', findings: [{label: '建造', field: 'abstract', quote: '建造住所'}], unknowns: ['尚不能判断感情线']});
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

test('默认不配置，不读取书籍，也不调用模型', async () => {
  let loads = 0;
  const service = createBookAnalysisService({loadBook: async () => {loads++; return book;}});
  assert.equal(service.available, false);
  await assert.rejects(service.analyze(id), {code: 'NOT_CONFIGURED'});
  assert.equal(loads, 0);
});

test('输入仅公开资料，结果只返回允许字段，且不修改原资料', async () => {
  let received;
  const service = createBookAnalysisService({loadBook: async key => {assert.equal(key, id); return book;},
    provider: {id: 'fake', analyze: async (input, {signal}) => {
      received = input;
      assert.ok(signal instanceof AbortSignal);
      assert.ok(Object.isFrozen(input));
      return {...answer(), state: 'skip', source: 'fabricated'};
    }}});
  assert.equal(service.available, true);
  const result = await service.analyze(id);
  assert.deepEqual(Object.keys(received).sort(), ['abstract', 'author', 'id', 'meta', 'source', 'title']);
  assert.deepEqual(received.source, {kind: 'official-detail', url: `https://fanqienovel.com/page/${id}`});
  assert.deepEqual(result, {bookId: id, providerId: 'fake', ...answer()});
  assert.equal(book.state, 'later');
});

test('无效或伪造的引用不进入结果', async () => {
  for (const raw of [
    {...answer(), findings: [{label: '爱情', field: 'abstract', quote: '两人相爱'}]},
    {...answer(), findings: [{label: '私人偏好', field: 'note', quote: 'private'}]},
    {...answer(), findings: [{label: '空依据', field: 'title', quote: ' '}]},
    {...answer(), summary: 'x'.repeat(4001)},
    {...answer(), unknowns: [null]}, null
  ]) {
    const service = createBookAnalysisService({loadBook: async () => book, provider: {id: 'fake', analyze: async () => raw}});
    await assert.rejects(service.analyze(id), {code: 'INVALID_RESULT'});
  }
});

test('预先取消不读取资料，加载期间取消不再调用提供方', async () => {
  let loads = 0, calls = 0, release;
  const service = createBookAnalysisService({loadBook: () => {loads++; return new Promise(resolve => {release = resolve;});},
    provider: {id: 'fake', analyze: async () => {calls++; return answer();}}});
  const before = new AbortController(); before.abort();
  await assert.rejects(service.analyze(id, {signal: before.signal}), {code: 'ABORTED'});
  assert.equal(loads, 0);
  const during = new AbortController();
  const pending = service.analyze(id, {signal: during.signal});
  during.abort();
  await assert.rejects(pending, {code: 'ABORTED'});
  release(book); await wait(5);
  assert.equal(calls, 0);
});

test('超时通知提供方并忽略迟到结果，即使提供方不主动结束', async () => {
  let signal, release;
  const service = createBookAnalysisService({loadBook: async () => book,
    provider: {id: 'fake', analyze: (_, options) => {signal = options.signal; return new Promise(resolve => {release = resolve;});}}});
  await assert.rejects(service.analyze(id, {timeoutMs: 10}), {code: 'TIMEOUT'});
  assert.equal(signal.aborted, true);
  release(answer()); await wait(5);
});

test('读取失败和提供方失败保留原错误，非法 ID 不触发加载', async () => {
  const error = new Error('offline');
  let calls = 0;
  const service = createBookAnalysisService({loadBook: async () => {throw error;}, provider: {id: 'fake', analyze: async () => {calls++;}}});
  await assert.rejects(service.analyze(id), value => value === error);
  await assert.rejects(service.analyze('../cookies'), {code: 'INVALID_BOOK'});
  assert.equal(calls, 0);
  const failing = createBookAnalysisService({loadBook: async () => book, provider: {id: 'fake', analyze: async () => {throw error;}}});
  await assert.rejects(failing.analyze(id), value => value === error);
});
