// Optional analysis boundary. No provider is installed by default.
// Providers receive public book metadata only, never storage or account adapters.
function analysisError(code, message) {
  return Object.assign(new Error(message), {code});
}

function analysisInput(id, book) {
  if (!book || typeof book !== 'object') throw analysisError('INVALID_BOOK', '无法取得书籍资料');
  const input = {id, source: Object.freeze({kind: 'official-detail', url: `https://fanqienovel.com/page/${id}`})};
  for (const field of ['title', 'author', 'abstract', 'meta']) {
    const value = book[field] ?? '';
    if (typeof value !== 'string' || value.length > 100000) throw analysisError('INVALID_BOOK', '无效的书籍资料');
    input[field] = value;
  }
  return Object.freeze(input);
}

function analysisResult(raw, input, providerId) {
  const invalid = () => { throw analysisError('INVALID_RESULT', '分析结果格式或引用依据无效'); };
  const text = (value, max) => typeof value === 'string' && value.length <= max;
  if (!raw || !text(raw.summary, 4000) || !Array.isArray(raw.findings) || raw.findings.length > 50 ||
      !Array.isArray(raw.unknowns) || raw.unknowns.length > 50) invalid();
  const findings = raw.findings.map(item => {
    if (!item || !text(item.label, 200) || !item.label.trim() ||
        !['title', 'abstract', 'meta'].includes(item.field) || !text(item.quote, 2000) ||
        !item.quote.trim() || !input[item.field].includes(item.quote)) invalid();
    return Object.freeze({label: item.label, field: item.field, quote: item.quote});
  });
  const unknowns = raw.unknowns.map(item => { if (!text(item, 1000) || !item.trim()) invalid(); return item; });
  return Object.freeze({bookId: input.id, providerId, summary: raw.summary,
    findings: Object.freeze(findings), unknowns: Object.freeze(unknowns)});
}

/** @param {{loadBook: (id: string) => Promise<object>, provider?: object|null}} options */
function createBookAnalysisService({loadBook, provider = null}) {
  if (typeof loadBook !== 'function') throw new TypeError('loadBook 必须是函数');
  if (provider !== null && (typeof provider?.id !== 'string' || !provider.id.trim() || provider.id.length > 100 || typeof provider.analyze !== 'function')) {
    throw new TypeError('无效的分析提供方');
  }
  // Capture the contract once; later mutation of the injected object cannot change it.
  const providerId = provider?.id;
  const runProvider = provider?.analyze.bind(provider);
  return Object.freeze({
    available: provider !== null,
    async analyze(id, {signal, timeoutMs = 30000} = {}) {
      if (!runProvider) throw analysisError('NOT_CONFIGURED', '尚未配置分析服务');
      if (typeof id !== 'string' || !/^\d{5,25}$/.test(id)) throw analysisError('INVALID_BOOK', '无效书籍 ID');
      if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 120000) throw new RangeError('无效的分析超时设置');
      const controller = new AbortController();
      const cancel = () => controller.abort(analysisError('ABORTED', '已取消分析'));
      if (signal?.aborted) cancel();
      signal?.addEventListener('abort', cancel, {once: true});
      const timer = setTimeout(() => controller.abort(analysisError('TIMEOUT', '分析超时')), timeoutMs);
      let onAbort;
      const cancelled = new Promise((_, reject) => {
        onAbort = () => reject(controller.signal.reason);
        if (controller.signal.aborted) onAbort();
        else controller.signal.addEventListener('abort', onAbort, {once: true});
      });
      const check = () => { if (controller.signal.aborted) throw controller.signal.reason; };
      const work = async () => {
        check();
        const book = await loadBook(id);
        check();
        const input = analysisInput(id, book);
        const raw = await runProvider(input, {signal: controller.signal});
        check();
        return analysisResult(raw, input, providerId);
      };
      try { return await Promise.race([cancelled, work()]); }
      finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', cancel);
        controller.signal.removeEventListener('abort', onAbort);
      }
    }
  });
}

export {createBookAnalysisService};
