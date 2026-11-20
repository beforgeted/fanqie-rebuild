// Local Chrome extension adapter. No remote resources or network requests.
(async () => {
  const cache = await chrome.storage.local.get('fq-keyword-filter-v1');
  function GM_getValue(key, fallback) { return Object.hasOwn(cache, key) ? cache[key] : fallback; }
  async function GM_setValue(key, value) { await chrome.storage.local.set({[key]:value}); cache[key] = value; }
  function GM_registerMenuCommand() {} // The page's floating panel provides settings.
  async function FQ_HISTORY(message) {
    const response = await chrome.runtime.sendMessage({channel:'fq-filter-history',...message});
    if (!response?.ok) throw new Error(response?.error || '记录操作失败');
    return response.result;
  }
// ==UserScript==
// @name         番茄书库 · 二游关键词屏蔽
// @namespace    local.fanqie.keyword.filter
// @version      1.3.1
// @description  在番茄书库和排行榜按书名、简介隐藏小说；支持字体编码识别、编辑词表、临时显示。
// @match        https://fanqienovel.com/*
// @match        https://www.fanqienovel.com/*
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_listValues
// @grant        GM_registerMenuCommand
// @noframes
// @license      GPL-3.0-or-later
// ==/UserScript==

/* 字体字符对应数据参考 naiyQAQ/fanqie-assistant (GPLv3):
 * https://github.com/naiyQAQ/fanqie-assistant
 * https://greasyfork.org/scripts/589115/code
 * 本脚本不请求接口，不上传阅读记录，不修改正文。 */
(() => {
  'use strict';
  if (document.getElementById('fq-keyword-filter-host')) return;
  const DEFAULT_WORDS = ['原神', '崩铁', '星穹铁道', '星铁', '崩坏3', '崩坏三', '绝区零', '鸣潮'];
  const STORE = 'fq-keyword-filter-v1';
  const MARK = 'data-fq-keyword-blocked';
  const LAYOUT = 'data-fq-keyword-layout';
  // 书库源码与排行榜官网 HTML 中分别确认的卡片结构。
  const CARD = '.stack-book-item, .rank-book-item';
  const TITLE = '.book-item-title, .book-item-text > .title';
  const ABSTRACT = '.book-item-abstract, .book-item-text > .abstract';
  // HISTORY_CORE_BEGIN
  // Shared with the extension service worker. Each book has its own key; writes
  // are serialized by the caller so records/handled marks survive tab races.
  async function historyOperation(storage, message) {
    const prefix = 'fq-history-book-';
    const validId = id => typeof id === 'string' && /^\d{5,25}$/.test(id);
    const keyOf = id => prefix + id;
    const cleanMatches = matches => [...new Set((Array.isArray(matches) ? matches : [])
      .filter(x => typeof x === 'string').map(x => x.slice(0,200)))];
    if (message.action === 'list') {
      const all = await storage.all();
      return Object.entries(all).filter(([key, value]) => key.startsWith(prefix) && value &&
        validId(value.id) && key === keyOf(value.id) && typeof value.title === 'string')
        .map(([,value]) => value).sort((a,b) => b.lastSeen - a.lastSeen || a.id.localeCompare(b.id));
    }
    if (message.action === 'record') {
      const entries = Array.isArray(message.records) ? message.records : [];
      const updates = {};
      for (const entry of entries) {
        if (!entry || !validId(entry.id) || typeof entry.title !== 'string' || !entry.title.trim()) continue;
        const key = keyOf(entry.id);
        const previous = updates[key] || await storage.get(key) || {};
        const now = Date.now();
        updates[key] = {
          id:entry.id, title:entry.title.slice(0,500),
          author:typeof entry.author === 'string' ? entry.author.slice(0,200) : previous.author || '',
          url:'https://fanqienovel.com/page/' + entry.id,
          matches:cleanMatches([...(previous.matches || []), ...cleanMatches(entry.matches)]),
          firstSeen:previous.firstSeen || now, lastSeen:now,
          handledAt:previous.handledAt || 0
        };
      }
      if (Object.keys(updates).length) await storage.set(updates);
      return {recorded:Object.keys(updates).length};
    }
    if (message.action === 'mark' && validId(message.id)) {
      const key = keyOf(message.id), previous = await storage.get(key);
      if (!previous) throw new Error('这本书的记录已不存在');
      await storage.set({[key]:{...previous,handledAt:message.handled === true ? Date.now() : 0}});
      return {ok:true};
    }
    throw new Error('无效的记录操作');
  }
  // HISTORY_CORE_END
  let historyQueue = Promise.resolve();
  function historyCall(message) {
    if (typeof FQ_HISTORY === 'function') return FQ_HISTORY(message);
    const storage = {
      get: async key => GM_getValue(key, null),
      all: async () => {
        const keys = typeof GM_listValues === 'function' ? await GM_listValues() : [];
        const entries = await Promise.all(keys.filter(k=>k.startsWith('fq-history-book-')).map(async k=>[k,await GM_getValue(k,null)]));
        return Object.fromEntries(entries);
      },
      set: async values => { for (const [key,value] of Object.entries(values)) await GM_setValue(key,value); }
    };
    const run = () => historyOperation(storage,message);
    const job = historyQueue.then(() => navigator.locks?.request ? navigator.locks.request('fq-filter-history',run) : run());
    historyQueue = job.catch(()=>{});
    return job;
  }
  const recordedSignatures = new Map();
  let historyRows = [], historyError = '', historyView = false, historyRefreshId = 0;
  const FONTS = {
    fKts9tCXDjS49UhH: [
      '体y十现快使话却月物水的放知爱方?表风理O老也p常克平几最主她s',
      '将法情o光a我呢J员太每望受教w利军已U人如变得要少斯门电m男没',
      'AK国时中走么何口小向问轻Td神下间车fG度D又大面远就写j给通',
      '起实E?它去S到道数吃们加P是无把事西多界?发新外活解孩只作前Y',
      '尔经?u心告父等Q民全这9果安?i母8r说任先和地C张战场g像c',
      'q你使?样总目x性处音头?应乐关能花I当名手4重字声力友然生代内',
      '里本回真入师象?0点R亲V种动英命ZhX做特边高有B为期自年马认',
      '出接至H正方感所明者棱F住学还分意更其n但比觉以由死家让失士L2',
      'I金叫身报听W再原山海白很见5直位第工个开岁好用都于可同3次四?',
      '日信与女笑满并部什不从或机此?了记三e些bN夫会才几眼两美被一公',
      '来立z长对己看k许因相色后往打结格过世气7子条在书之定v拉成进带',
      '着东上想天他妈1文而路那别德6Mt行候难'
    ].join(''),
    DNMrHsV173Pd4pgy: [
      'D在主特家军然表场4要只v和?6别还g现儿岁??此象月3出战工相',
      'o男直失世F都平文什VO将真T那当?会立些u是十张学气大爱两命全',
      '后东性通被1它乐接而感车山公了常以何可话先pi叫轻M士w着变尔快',
      'l个说少色里安花远7难师放t报认面道S?克地度I好机U民写把万同',
      '水新没书电吃像斯5为y白几日教看但第加候作上拉住有法r事应位利你',
      '声身国问马女他Y比父xAHNsX边美对所金活回意到z从j知又内因',
      '点Q三定8Rb正或夫向德听更?得告并本q过记L让打f人就者去原满',
      '体做经K走如孩cG给使物?最笑部?员等受k行一条果动光门头见往自',
      '解成处天能于名其发总母的死手入路进心来h时力多开已许d至由很界n',
      '小与Z想代么分生口再妈望次西风种带J?实情才这?E我神格长觉间年',
      '眼无不亲关结0友信下却重己老2音字m呢明之前高PB目太e9起稜她',
      '也W用方子英每理便四数期中C外样a海们任'
    ].join('')
  };
  const saved = GM_getValue(STORE, {});
  let config = {
    words: Array.isArray(saved?.words) ? saved.words.filter(x => typeof x === 'string' && x.trim()) : DEFAULT_WORDS.slice(),
    enabled: saved?.enabled !== false,
    abstract: saved?.abstract !== false
  };
  let reveal = false;
  let timer;
  let lastPath = location.pathname;
  const normalize = text => text.normalize('NFKC').toLowerCase().replace(/[\s\p{P}\u200b-\u200d\ufeff]/gu, '');
  const supportedPage = () => /^\/(?:library|rank)(?:\/|$)/.test(location.pathname);

  function readText(element) {
    if (!element) return '';
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let result = '', node;
    while ((node = walker.nextNode())) {
      let table;
      for (let parent = node.parentElement; parent; parent = parent.parentElement) {
        const font = [...parent.classList].find(c => c.startsWith('font-'));
        if (font) { table = FONTS[font.slice(5)]; break; }
        if (parent.matches(CARD)) break;
      }
      result += [...node.nodeValue].map(char => {
        const index = char.codePointAt(0) - 58344;
        return table?.length === 372 && index >= 0 && index < 372 && table[index] !== '?' ? table[index] : char;
      }).join('');
    }
    return result;
  }

  const style = document.createElement('style');
  style.textContent = `[${MARK}="hide"]{display:none!important}[${MARK}="show"]{outline:2px dashed #ed693a!important;outline-offset:-2px}
    .muye-stack-book-list[${LAYOUT}]{column-gap:var(--fq-column-gap)!important}
    .muye-stack-book-list[${LAYOUT}] > .stack-book-item{margin-right:0!important}`;
  document.head.append(style);
  const host = document.createElement('div');
  host.id = 'fq-keyword-filter-host';
  host.style.cssText = 'position:fixed;right:20px;bottom:24px;z-index:2147483646';
  const shadow = host.attachShadow({mode:'open'});
  shadow.innerHTML = `
    <style>
      :host{font:14px/1.6 system-ui,"Microsoft YaHei",sans-serif;color:#292524;color-scheme:light}
      *{box-sizing:border-box}button,textarea,input{font:inherit}button{cursor:pointer;border:1px solid #d6d3d1;border-radius:8px;padding:7px 12px;background:white;color:#292524}
      button:hover{background:#fff3eb}button:focus-visible,textarea:focus-visible{outline:2px solid #c2410c;outline-offset:2px}
      #open,#save{background:#a83e19;color:white;border-color:#a83e19}#open{box-shadow:0 3px 18px #0002}
      #panel{width:min(350px,calc(100vw - 40px));max-height:80vh;overflow:auto;padding:18px;background:#fffdfb;border:1px solid #e7ded5;border-radius:14px;box-shadow:0 8px 35px #0002;margin-bottom:10px}
      #panel[data-view="history"]{width:min(640px,calc(100vw - 40px))}
      [hidden]{display:none!important}h2{margin:0 0 8px;font-size:17px}p{margin:8px 0;font-size:12px;color:#75675d}
      label{display:block;margin:10px 0}textarea{width:100%;height:164px;resize:vertical;border:1px solid #d6d3d1;border-radius:7px;padding:8px;background:white;color:#292524}
      .row{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}#status{font-size:13px}#warning{color:#a83e19}input{accent-color:#a83e19}
      #history-list{list-style:none;padding:0;margin:12px 0;max-height:38vh;overflow:auto}#history-list li{padding:12px 0;border-bottom:1px solid #ece4dd}
      #history-list a{font-weight:600;color:#983c1d;text-decoration:none}#history-list a:hover{text-decoration:underline}
      .meta{font-size:12px;color:#75675d;overflow-wrap:anywhere}.history-actions{display:flex;gap:8px;margin-top:8px}
      #history-search{width:100%;padding:8px;border:1px solid #d6d3d1;border-radius:7px;font:inherit}
      #history-filter{padding:7px;border:1px solid #d6d3d1;border-radius:7px;background:white;color:#292524;font:inherit}
      #history-message,#history-save-warning{color:#a83e19;font-size:12px}#copy-fallback textarea{height:110px}
    </style>
    <section id="panel" hidden aria-label="番茄小说屏蔽设置">
      <h2>书库 / 排行榜屏蔽 · v1.3.1</h2>
      <div id="settings-view">
      <div id="status" role="status"></div>
      <p id="warning"></p>
      <label><input id="enabled" type="checkbox"> 启用屏蔽</label>
      <label><input id="abstract" type="checkbox"> 同时检查简介（更少漏网，可能误伤）</label>
      <label for="words">屏蔽词 · 每行一个</label>
      <textarea id="words" spellcheck="false"></textarea>
      <p>命中任一词即隐藏整本书。支持空格、全角数字和标点变体；不按作者名匹配。只处理当前页面已加载的书籍。</p>
      <div class="row"><button id="save">保存并应用</button><button id="close">关闭</button></div>
      <div class="row"><button id="reveal">临时显示已屏蔽</button><button id="reset">填入默认词表</button></div>
      <p>临时显示后，命中卡片以橙色虚线标出。简介只是提到游戏也会命中，可取消检查简介。</p>
      <div class="row"><button id="history-open">屏蔽记录 / 待处理清单</button></div>
      <p>自动记录已遇到的命中书籍并按书籍 ID 去重，仅保存在此浏览器。</p>
      <p id="history-save-warning" role="status"></p>
      </div>
      <section id="history-view" hidden aria-label="屏蔽记录">
        <p>这是本地过滤记录，尚未提交番茄“不感兴趣”。可复制书名后在 App 操作，再手动标记已处理。</p>
        <div id="history-summary" role="status"></div>
        <div class="row"><input id="history-search" type="search" aria-label="搜索记录" placeholder="搜索书名、作者或命中词"></div>
        <div class="row"><select id="history-filter" aria-label="处理状态"><option value="pending">待处理</option><option value="all">全部记录</option><option value="handled">我已处理</option></select><button id="history-refresh">刷新记录</button></div>
        <div class="row"><button id="history-copy">复制待处理书单</button><button id="history-export">导出全部 CSV</button></div>
        <p id="history-message" role="status"></p>
        <div id="copy-fallback" hidden><p>浏览器未允许自动复制，请选中下方文字后按 Ctrl+C。</p><textarea id="copy-text" readonly aria-label="待复制内容"></textarea></div>
        <ul id="history-list"></ul>
        <div class="row"><button id="history-back">返回设置</button><button id="history-close">关闭</button></div>
      </section>
    </section>
    <button id="open" aria-expanded="false">关键词屏蔽</button>`;
  document.body.append(host);
  const $ = id => shadow.getElementById(id);
  function showHistory(show) {
    historyView = show;
    $('settings-view').hidden = show;
    $('history-view').hidden = !show;
    $('panel').dataset.view = show ? 'history' : 'settings';
    if (show) refreshHistory();
  }
  function renderHistory() {
    const pending = historyRows.filter(row=>!row.handledAt).length;
    $('history-summary').textContent = `共 ${historyRows.length} 本 · 待处理 ${pending} 本 · 我已处理 ${historyRows.length-pending} 本`;
    const query = normalize($('history-search').value), mode = $('history-filter').value;
    const rows = historyRows.filter(row => (mode === 'all' || (mode === 'handled' ? !!row.handledAt : !row.handledAt)) &&
      (!query || normalize([row.title,row.author,...(row.matches||[])].join(' ')).includes(query)));
    const fragment = document.createDocumentFragment();
    for (const row of rows) {
      const li = document.createElement('li');
      li.dataset.bookId = row.id;
      const link = document.createElement('a');
      link.href = 'https://fanqienovel.com/page/' + row.id;
      link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = row.title;
      li.append(link);
      const meta = document.createElement('div'); meta.className = 'meta';
      const date = value => new Date(value).toLocaleString('zh-CN',{hour12:false});
      meta.textContent = `${row.author ? '作者：'+row.author+' · ' : ''}命中：${(row.matches||[]).join('、')}\n首次：${date(row.firstSeen)} · 最近：${date(row.lastSeen)}${row.handledAt ? ' · 已手动标记处理' : ''}`;
      meta.style.whiteSpace = 'pre-line'; li.append(meta);
      const actions = document.createElement('div'); actions.className = 'history-actions';
      const copy = document.createElement('button'); copy.textContent = '复制书名';
      copy.onclick = () => copyText(row.title);
      const mark = document.createElement('button'); mark.textContent = row.handledAt ? '恢复待处理' : '标记我已处理';
      mark.title = '只记录你的处理进度，不向番茄提交操作';
      mark.onclick = async () => {
        mark.disabled = true;
        try { await historyCall({action:'mark',id:row.id,handled:!row.handledAt}); await refreshHistory(); }
        catch { $('history-message').textContent = '处理标记保存失败，请重试。'; mark.disabled = false; }
      };
      actions.append(copy,mark); li.append(actions); fragment.append(li);
    }
    if (!rows.length) {
      const li = document.createElement('li'); li.textContent = historyRows.length ? '没有符合条件的记录。' : '还没有记录。浏览书库或排行榜后，命中的书会自动保存在这里。'; fragment.append(li);
    }
    $('history-list').replaceChildren(fragment);
  }
  async function refreshHistory() {
    const requestId = ++historyRefreshId;
    try {
      const rows = await historyCall({action:'list'});
      if (requestId !== historyRefreshId) return;
      historyRows = rows; renderHistory();
      $('history-message').textContent = historyError;
    } catch { if (requestId === historyRefreshId) $('history-message').textContent = '读取记录失败，请点击刷新记录重试。'; }
  }
  async function copyText(text) {
    if (!text) { $('history-message').textContent = '没有待复制的书籍。'; return; }
    $('copy-fallback').hidden = true;
    try { await navigator.clipboard.writeText(text); $('history-message').textContent = '已复制，可在手机 App 中查找并操作。'; }
    catch {
      $('copy-text').value = text; $('copy-fallback').hidden = false;
      $('copy-text').focus(); $('copy-text').select();
    }
  }
  $('history-open').onclick = () => showHistory(true);
  $('history-back').onclick = () => showHistory(false);
  $('history-close').onclick = closePanel;
  $('history-search').oninput = renderHistory;
  $('history-filter').onchange = renderHistory;
  $('history-refresh').onclick = refreshHistory;
  $('history-copy').onclick = () => copyText(historyRows.filter(row=>!row.handledAt).map(row=>`${row.title}\nhttps://fanqienovel.com/page/${row.id}`).join('\n\n'));
  $('history-export').onclick = () => {
    if (!historyRows.length) { $('history-message').textContent = '暂无记录可导出。'; return; }
    // Prevent spreadsheet formulas in book titles/authors from executing on open.
    const cell = value => { let s=String(value??''); if (/^[\s]*[=+@-]/.test(s)) s="'"+s; return '"'+s.replace(/"/g,'""')+'"'; };
    const rows = [['书名','作者','书籍ID','书籍链接','命中词','首次记录','最近记录','处理状态'],
      ...historyRows.map(row=>[row.title,row.author,row.id,'https://fanqienovel.com/page/'+row.id,(row.matches||[]).join('、'),new Date(row.firstSeen).toISOString(),new Date(row.lastSeen).toISOString(),row.handledAt?'我已处理（手动标记）':'待处理'])];
    const blob = new Blob(['\ufeff'+rows.map(row=>row.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = '番茄屏蔽记录-'+new Date().toISOString().slice(0,10)+'.csv';
    link.click(); setTimeout(()=>URL.revokeObjectURL(url),30000);
  };
  function rememberCards(records) {
    const fresh = records.filter(row=>recordedSignatures.get(row.id)!==JSON.stringify(row));
    if (!fresh.length) return;
    for (const row of fresh) recordedSignatures.set(row.id,JSON.stringify(row));
    historyCall({action:'record',records:fresh}).then(()=>{
      historyError = ''; $('history-save-warning').textContent = '';
      if (historyView) refreshHistory();
    }).catch(()=>{
      for (const row of fresh) recordedSignatures.delete(row.id);
      historyError = '屏蔽仍生效，但记录保存失败；请检查扩展存储后刷新页面。';
      $('history-save-warning').textContent = historyError;
      if (historyView) $('history-message').textContent = historyError;
    });
  }
  function openPanel() {
    $('words').value = config.words.join('\n');
    $('enabled').checked = config.enabled;
    $('abstract').checked = config.abstract;
    $('panel').hidden = false;
    $('open').setAttribute('aria-expanded', 'true');
    if (historyView) refreshHistory();
  }
  function closePanel() {
    $('panel').hidden = true;
    $('open').setAttribute('aria-expanded', 'false');
  }
  $('open').onclick = () => $('panel').hidden ? openPanel() : closePanel();
  $('close').onclick = closePanel;
  $('panel').addEventListener('keydown', e => { if (e.key === 'Escape') closePanel(); });
  $('save').onclick = async () => {
    const words = [...new Set($('words').value.split(/[\n,，;；]+/).map(x => x.trim()).filter(x => normalize(x)))];
    const next = {words, enabled:$('enabled').checked, abstract:$('abstract').checked};
    try { await GM_setValue(STORE, next); }
    catch { $('warning').textContent = '保存失败，请检查油猴权限后重试。'; return; }
    config = next;
    reveal = false;
    scan();
  };
  $('reset').onclick = () => { $('words').value = DEFAULT_WORDS.join('\n'); };
  $('reveal').onclick = () => { reveal = !reveal; scan(); };
  GM_registerMenuCommand('番茄小说：编辑屏蔽词', () => { if (supportedPage()) openPanel(); else alert('请在番茄小说的「书库」或「排行榜」页面设置屏蔽词。'); });

  const observer = new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(scan, 120);
  });
  const observe = () => observer.observe(document.body, {subtree:true, childList:true, characterData:true, attributes:true, attributeFilter:['class']});
  function alignLibraryCards() {
    for (const list of document.querySelectorAll('.muye-stack-book-list')) {
      // nth-child spacing counts hidden books too. Let flex gap space only the
      // visible cards, preserving native widths, wrapping, and vertical margins.
      list.removeAttribute(LAYOUT);
      list.style.removeProperty('--fq-column-gap');
      const cards = [...list.children].filter(child=>child.matches('.stack-book-item'));
      if (!cards.some(card=>card.getAttribute(MARK)==='hide')) continue;
      const gap = Math.max(0,...cards.map(card=>parseFloat(getComputedStyle(card).marginRight)||0));
      list.style.setProperty('--fq-column-gap',gap+'px');
      list.setAttribute(LAYOUT,'aligned');
    }
  }
  function scan() {
    observer.disconnect();
    try {
      const active = supportedPage();
      host.hidden = !active;
      if (!active) {
        document.querySelectorAll(`[${MARK}]`).forEach(card => card.removeAttribute(MARK));
        alignLibraryCards();
        return;
      }
      const words = config.words.map(normalize).filter(Boolean);
      const cards = [...document.querySelectorAll(CARD)];
      let hits = 0, unknown = 0;
      const records = [];
      for (const card of cards) {
        const fields = [readText(card.querySelector(TITLE))];
        if (config.abstract) fields.push(readText(card.querySelector(ABSTRACT)));
        if (fields.some(text => /[\ue000-\uf8ff]/u.test(text))) unknown++;
        const hit = config.enabled && fields.some(text => words.some(word => normalize(text).includes(word)));
        if (hit) {
          hits++; card.setAttribute(MARK, reveal ? 'show' : 'hide');
          const bookLink = card.querySelector('a[href*="/page/"]');
          const id = bookLink?.getAttribute('href')?.match(/\/page\/(\d+)(?:[/?#]|$)/)?.[1];
          if (id) {
            const author = readText(card.querySelector('.book-item-text > .author, .book-item-text > .book-item-desc')).replace(/^作者\s*[：:]\s*/,'').trim();
            const matches = config.words.filter(word => normalize(word) && fields.some(text=>normalize(text).includes(normalize(word))));
            records.push({id,title:fields[0].trim() || '书籍 '+id,author,matches});
          }
        }
        else card.removeAttribute(MARK);
      }
      alignLibraryCards();
      $('open').textContent = config.enabled ? `关键词屏蔽 · ${hits} 本` : '关键词屏蔽 · 已暂停';
      $('status').textContent = `本页识别 ${cards.length} 本，${reveal ? '命中' : '已隐藏'} ${hits} 本。`;
      $('warning').textContent = unknown ? `${unknown} 本含尚未识别的字体字符，可能漏屏蔽。` : cards.length ? '' : '尚未识别到书籍；请等加载完成。若列表已出现，网站结构可能已更新。';
      $('reveal').textContent = reveal ? '重新隐藏命中书籍' : '临时显示已屏蔽';
      rememberCards(records);
    } finally { observe(); }
  }
  scan();
  // 覆盖网站内部跳转，包括书库与排行榜之间切换；无需改写网站 history。
  setInterval(() => {
    if (location.pathname !== lastPath) { lastPath = location.pathname; reveal = false; recordedSignatures.clear(); scan(); }
  }, 700);
})();

})().catch(error => console.error('[番茄关键词屏蔽] 初始化失败', error));
