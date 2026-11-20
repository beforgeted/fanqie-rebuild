// Local Chrome extension adapter. User-initiated shelf sync uses official same-origin APIs.
(async () => {
  const cache = await chrome.storage.local.get(['fq-keyword-filter-v1','fq-infinite-enabled']);
  function GM_getValue(key, fallback) { return Object.hasOwn(cache, key) ? cache[key] : fallback; }
  async function GM_setValue(key, value) { await chrome.storage.local.set({[key]:value}); cache[key] = value; }
  function FQ_CHOICE_WATCH(fn) { chrome.storage.onChanged?.addListener((changes,area)=>{if(area==='local'&&Object.keys(changes).some(k=>k.startsWith('fq-choice-')||k.startsWith('fq-official-sync-')))fn();}); }
  function GM_registerMenuCommand() {} // The integrated page drawer provides settings.
  async function FQ_HISTORY(message) {
    const response = await chrome.runtime.sendMessage({channel:'fq-filter-history',...message});
    if (!response?.ok) throw new Error(response?.error || '记录操作失败');
    return response.result;
  }
// ==UserScript==
// @name         番茄书库 · 二游关键词屏蔽
// @namespace    local.fanqie.keyword.filter
// @version      1.9.0
// @description  在番茄书库和排行榜按书名、简介隐藏小说；支持字体编码识别、编辑词表、临时显示。
// @match        https://fanqienovel.com/*
// @match        https://www.fanqienovel.com/*
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_listValues
// @grant        GM_registerMenuCommand
// @noframes
// @license      GPL-3.0-only
// @copyright    字体映射：naiyQAQ/fanqie-assistant 贡献者；详见下文来源注释。
// @supportURL   https://github.com/beforgeted/fanqie-rebuild/issues
// ==/UserScript==
// GPL version 3 only: https://www.gnu.org/licenses/gpl-3.0.html
// Source and notices: https://github.com/beforgeted/fanqie-rebuild

/* 字体字符映射复制自 naiyQAQ/fanqie-assistant，作者 naiyQAQ 及贡献者 (GPLv3)。
 * 两套表各 372 字符，拼接为字符串；本项目另写 readText 读取逻辑。
 * 2026-11-21 补全来源；上游 README 存在与 GPL 不一致的用途限制，详见第三方来源与许可.md。
 * https://github.com/naiyQAQ/fanqie-assistant
 * https://github.com/naiyQAQ/fanqie-assistant/blob/2fa27f8e885232ca2583e931830f95775368538d/src/fontDecrypt.ts
 * 仅请求番茄官方接口；用户主动同步候选时写入官方书架，不修改正文。 */
(async () => {
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
    if(message.action==='syncList'||message.action==='syncSave'){
      if(!/^\d{1,30}$/.test(message.accountId||''))throw Error('无效账号');
      const prefix='fq-official-sync-'+message.accountId+'-';
      if(message.action==='syncList')return Object.entries(await storage.all()).filter(([key,row])=>key.startsWith(prefix)&&row&&key===prefix+row.id).map(([,row])=>row);
      if(!/^\d{5,25}$/.test(message.id||'')||!['queued','syncing','success','failed'].includes(message.status))throw Error('无效同步记录');
      const row={id:message.id,status:message.status,message:String(message.message||'').slice(0,300),groupId:String(message.groupId||''),updatedAt:Date.now()};await storage.set({[prefix+message.id]:row});return row;
    }
    const choicePrefix='fq-choice-';
    if(message.action==='choices') return Object.entries(await storage.all()).filter(([k,v])=>k.startsWith(choicePrefix)&&v&&/^\d{5,25}$/.test(v.id)).map(([,v])=>v);
    if(message.action==='choiceMeta'||message.action==='note') {
      if(!/^\d{5,25}$/.test(message.id||''))throw Error('无效书籍');
      const key=choicePrefix+message.id,previous=await storage.get(key);
      if(!previous)throw Error('候选记录已不存在');let row;
      if(message.action==='note'){
        if((previous.noteRevision||0)!==message.revision)return {conflict:true,row:previous};
        row={...previous,note:String(message.note||'').slice(0,2000),noteRevision:(previous.noteRevision||0)+1,noteUpdatedAt:Date.now()};
      }else{
        const b=message.book||{};row={...previous};
        for(const [field,max] of [['title',500],['author',200],['abstract',12000],['meta',500]])if(typeof b[field]==='string'&&b[field].trim())row[field]=b[field].slice(0,max);
        if(typeof b.cover==='string'&&/^https:\/\//.test(b.cover))row.cover=b.cover.slice(0,3000);
      }
      await storage.set({[key]:row});return {row};
    }
    if(message.action==='choose') {
      const b=message.book;
      if(!b||!/^\d{5,25}$/.test(b.id)||!['none','later','skip'].includes(message.state))throw Error('无效标记');
      const previous=await storage.get(choicePrefix+b.id)||{};
      const row={...previous,id:b.id,cover:typeof b.cover==='string'&&/^https:\/\//.test(b.cover)?b.cover.slice(0,3000):previous.cover||'',meta:String(b.meta||previous.meta||'').slice(0,500),title:String(b.title||previous.title||b.id).slice(0,500),author:String(b.author||previous.author||'').slice(0,200),abstract:String(b.abstract||previous.abstract||'').slice(0,12000),state:message.state,updatedAt:Date.now()};
      await storage.set({[choicePrefix+b.id]:row});return row;
    }
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

  // OFFICIAL_CORE_BEGIN
  function parseOfficialJSON(text) {
    // Keep long account/book/group IDs exact; never round them through JS Number.
    return JSON.parse(text.replace(/"(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g,
      token=>/^-?\d{16,}$/.test(token)?'"'+token+'"':token));
  }
  function createOfficialShelfClient({fetchImpl,csrf,delay=ms=>new Promise(r=>setTimeout(r,ms))}) {
    const query='?aid=1967&iid=0&version_code=57700&update_version_code=57700';
    const base='/reading/bookapi/bookshelf/';
    async function request(url,body){
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
      try{
        const options={credentials:'same-origin',cache:'no-store',signal:controller.signal};
        if(body){const token=csrf();if(!token)throw Error('登录校验已失效，请重新登录番茄后重试。');Object.assign(options,{method:'POST',headers:{'Content-Type':'application/json','x-secsdk-csrf-token':token},body:JSON.stringify(body)});}
        const response=await fetchImpl(url,options);
        if(!response.ok)throw Error('官方请求失败（HTTP '+response.status+'），请稍后重试。');
        let data;try{data=parseOfficialJSON(await response.text());}catch{throw Error('官方返回了无法识别的数据，请稍后重试。');}
        if(data.code===undefined||data.code===null||Number(data.code)!==0)throw Error('官方未接受请求：'+String(data.message||data.msg||data.code).slice(0,180));
        return data.data;
      }catch(error){if(error.name==='AbortError')throw Error('请求超时，结果待核验；重试会先检查官方书架。');throw error;}
      finally{clearTimeout(timer);}
    }
    async function account(){const data=await request('/api/user/info/v2');const id=String(data?.id||data?.user_id||data?.uid||'');if(!/^\d+$/.test(id))throw Error('请先在番茄官网登录账号。');return id;}
    async function read(){const data=await request(base+'info/v:version/'+query);if(!Array.isArray(data?.book_shelf_info))throw Error('无法读取官方书架，请刷新或重新登录。');return data.book_shelf_info;}
    async function checkAccount(expected){if(await account()!==expected)throw Error('登录账号已切换，已停止同步，请刷新同步状态后重试。');}
    const find=(rows,id)=>rows.find(row=>String(row.book_id)===id);
    const inTarget=row=>!!row?.group_id&&row.group_name==='待看';
    async function verify(id,predicate){for(let attempt=0;attempt<3;attempt++){if(attempt)await delay(attempt*350);const rows=await read();if(predicate(find(rows,id)))return rows;}throw Error('官方尚未确认保存，结果待核验；重试会先检查书架。');}
    async function syncOne(id,{accountId,allowedGroup='',onStage=async()=>{}}){
      if(!/^\d{5,25}$/.test(id))throw Error('无效书籍 ID');
      await checkAccount(accountId);let rows=await read(),book=find(rows,id);
      if(inTarget(book))return {groupId:String(book.group_id),already:true};
      const checkMove=()=>{if(book?.group_id&&!inTarget(book)&&String(book.group_id)!==allowedGroup)throw Error('该书已在官方「'+(book.group_name||'其他分组')+'」，请重新选择并确认移动。');};
      checkMove();
      if(!book){
        await onStage('adding');await checkAccount(accountId);
        await request(base+'add/v:version/'+query,{identify_data:[{book_id:id,book_type:0,asterisked:false,modify_time:Date.now()}],add_book_source:0});
        rows=await verify(id,Boolean);book=find(rows,id);
      }
      if(inTarget(book))return {groupId:String(book.group_id),already:true};
      checkMove();
      const targets=[...new Set(rows.filter(inTarget).map(row=>String(row.group_id)))];
      if(targets.length>1)throw Error('官方书架有多个同名“待看”分组，请先整理为一个再重试。');
      const item={book_id:id,book_type:book.book_type??0,modify_time:Date.now(),group_name:'待看'};
      if(targets.length)item.group_id=targets[0];
      await onStage('moving');await checkAccount(accountId);
      await request(base+'update/v:version/'+query,{book_data:[item]});
      await onStage('verifying');rows=await verify(id,row=>inTarget(row)&&(!targets.length||String(row.group_id)===targets[0]));
      await checkAccount(accountId);
      return {groupId:String(find(rows,id).group_id),already:false};
    }
    return {account,read,syncOne,inTarget};
  }
  // OFFICIAL_CORE_END

  let historyQueue = Promise.resolve();
  function historyCall(message) {
    if (typeof FQ_HISTORY === 'function') return FQ_HISTORY(message);
    const storage = {
      get: async key => GM_getValue(key, null),
      all: async () => {
        const keys = typeof GM_listValues === 'function' ? await GM_listValues() : [];
        const entries = await Promise.all(keys.filter(k=>k.startsWith('fq-history-book-')||k.startsWith('fq-choice-')||k.startsWith('fq-official-sync-')).map(async k=>[k,await GM_getValue(k,null)]));
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
  let drawerReady=false,drawerTab=null,drawer=null,drawerReturn=null,drawerRulesLoaded=false;
  let intro=null;
  let reveal = false;
  let timer;
  let lastPath = location.pathname + location.search;
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
      <h2>书库 / 排行榜屏蔽 · v1.9.0</h2>
      <div id="settings-view">
      <div id="status" role="status"></div>
      <p id="warning"></p>
      <label><input id="enabled" type="checkbox"> 启用屏蔽</label>
      <label><input id="abstract" type="checkbox"> 同时检查简介（更少漏网，可能误伤）</label>
      <label>屏蔽词 <span id="word-count"></span></label>
      <div id="word-tags" role="list" aria-label="待保存的屏蔽词"></div>
      <label for="words">添加屏蔽词 · 支持一次输入多个</label>
      <textarea id="words" spellcheck="false" placeholder="例如：原神、崩铁，鸣潮；绝区零" aria-describedby="word-help word-preview"></textarea>
      <p id="word-help">用换行、逗号（,，）、顿号（、）、分号（;；）或制表符分隔；词内空格保留。</p>
      <div class="row"><button id="word-add">加入词表</button><span id="word-preview" role="status"></span></div>
      <p id="word-feedback" role="status">修改后点击“保存并应用”；尚未加入词表的输入也会一并保存。</p>
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
  const oldSaveRow=$('save').parentElement;$('word-add').parentElement.append($('save'),$('close'));oldSaveRow.remove();
  let wordDraft=[];
  function parsedWordInput(){
    const seen=new Set();return $('words').value.split(/[\r\n,，、;；\t]+/).map(w=>w.trim()).filter(w=>{const key=normalize(w);if(!key||seen.has(key))return false;seen.add(key);return true;});
  }
  function pendingWords(){const existing=new Set(wordDraft.map(normalize));return parsedWordInput().filter(w=>!existing.has(normalize(w)));}
  function previewWords(){const count=pendingWords().length;$('word-preview').textContent=$('words').value.trim()?(count?'可新增 '+count+' 个词':'没有新词，重复或无效内容会忽略'):'';}
  function renderWordTags(){
    $('word-count').textContent='· '+wordDraft.length+' 个';
    const fragment=document.createDocumentFragment();
    wordDraft.forEach((word,index)=>{const tag=document.createElement('span');tag.className='word-tag';tag.setAttribute('role','listitem');const text=document.createElement('span');text.textContent=word;tag.append(text);const remove=document.createElement('button');remove.type='button';remove.textContent='×';remove.setAttribute('aria-label','删除屏蔽词：'+word);remove.onclick=()=>{wordDraft.splice(index,1);renderWordTags();$('word-feedback').textContent='已移除“'+word+'”，保存后生效。';const buttons=$('word-tags').querySelectorAll('button');(buttons[Math.min(index,buttons.length-1)]||$('words')).focus({preventScroll:true});};tag.append(remove);fragment.append(tag);});
    if(!wordDraft.length){const empty=document.createElement('span');empty.textContent='暂无屏蔽词';empty.className='empty-words';fragment.append(empty);}
    $('word-tags').replaceChildren(fragment);previewWords();
  }
  function resetWordDraft(){wordDraft=config.words.slice();$('words').value='';$('word-feedback').textContent='修改后点击“保存并应用”；尚未加入词表的输入也会一并保存。';renderWordTags();}
  function addWordInput(){const additions=pendingWords();wordDraft.push(...additions);$('words').value='';renderWordTags();$('word-feedback').textContent=additions.length?'已加入 '+additions.length+' 个词，保存后生效。':'没有新增词，重复或无效内容已忽略。';}
  $('words').oninput=previewWords;
  $('words').addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'&&!e.isComposing){e.preventDefault();addWordInput();}});
  $('word-add').onclick=()=>{addWordInput();$('words').focus({preventScroll:true});};
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
    if(drawerReady){openDrawer('rules');return;}
    resetWordDraft();
    $('enabled').checked = config.enabled;
    $('abstract').checked = config.abstract;
    $('panel').hidden = false;
    $('open').setAttribute('aria-expanded', 'true');
    if (historyView) refreshHistory();
  }
  function closePanel() {
    if(drawerReady){closeDrawer();return;}
    $('panel').hidden = true;
    $('open').setAttribute('aria-expanded', 'false');
  }
  $('open').onclick = () => $('panel').hidden ? openPanel() : closePanel();
  $('close').onclick = closePanel;
  $('panel').addEventListener('keydown', e => { if (e.key === 'Escape') closePanel(); });
  $('save').onclick = async () => {
    addWordInput();
    const words = wordDraft.slice();
    const next = {words, enabled:$('enabled').checked, abstract:$('abstract').checked};
    try { await GM_setValue(STORE, next); }
    catch { $('word-feedback').textContent = '保存失败，请重试；词表草稿已保留。'; return; }
    config = next;
    $('word-feedback').textContent='已保存并应用 '+words.length+' 个屏蔽词。';
    reveal = false;
    scan();
  };
  $('reset').onclick = () => { wordDraft=DEFAULT_WORDS.slice();$('words').value='';renderWordTags();$('word-feedback').textContent='已填入默认词表，保存后生效。'; };
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

  let choices=new Map(),choiceStamp='',choiceBusy=false,suppressAutoUntil=0;
  try {choices=new Map((await historyCall({action:'choices'})).map(r=>[r.id,r]));}catch{}
  const choiceHost=document.createElement('div');choiceHost.id='fq-choice-host';
  choiceHost.style.cssText='display:block;max-width:1160px;margin:20px auto;';
  const cs=choiceHost.attachShadow({mode:'open'});
  cs.innerHTML='<style>:host{font:14px/1.6 system-ui;color:#292524}*{box-sizing:border-box}button,select,input{font:inherit}button{cursor:pointer;background:white;border:1px solid #d6d3d1;border-radius:7px;padding:6px 10px;margin:3px}button:disabled{opacity:.5}#box{width:100%;padding:24px;background:#fff;border:1px solid #eee;border-radius:6px}[hidden]{display:none!important}#rows>div{padding:10px 0;border-bottom:1px solid #eee}a{color:#a83e19}#msg{font-size:12px;color:#a83e19}input{width:100%}</style><button id="open">我的选书</button><section id="box" hidden><strong>我的选书 · 本地标记</strong><div id="current"></div><div id="msg" role="status"></div><select id="filter"><option value="later">候选</option><option value="skip">不想看</option></select><input id="query" placeholder="搜索书名或作者"><div id="official-tools" hidden><p>候选保存在本地。加入官方“待看”后，同账号手机可同步；清除本地候选不会移除官方书籍。</p><div class="sync-toolbar"><button id="sync-select">全选当前结果</button><button id="sync-batch">加入官方待看</button><button id="sync-retry">重试失败</button><button id="sync-refresh">刷新同步状态</button></div><p id="sync-message" role="status"></p><div id="sync-review" hidden></div></div><div id="rows"></div><button id="close">收起</button></section>';
  document.body.append(choiceHost);
  let choiceListOpen=false;
  const detailActions=document.createElement('span');detailActions.className='fq-detail-choices';detailActions.style.cssText='display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0';
  const detailFeedback=document.createElement('div');detailFeedback.className='fq-detail-feedback';detailFeedback.style.cssText='font:12px/1.6 system-ui;color:#777;min-width:0;overflow-wrap:anywhere';detailFeedback.setAttribute('role','status');
  const layoutStyle=document.createElement('style');
  layoutStyle.textContent=`
    .page-header-info:has(.fq-detail-choices){height:auto!important;overflow:visible!important;display:flow-root}
    .page-header-info .info:has(.fq-detail-choices){display:grid!important;grid-template-columns:150px 150px minmax(32px,1fr);column-gap:10px;row-gap:0;height:auto!important;min-height:234px;overflow:visible!important}
    .info:has(.fq-detail-choices)>.info-name{grid-area:1/1/2/-1;min-width:0}
    .info:has(.fq-detail-choices)>.info-label{grid-area:2/1/3/-1;min-width:0}
    .info:has(.fq-detail-choices)>.info-count{grid-area:3/1/4/-1;min-width:0}
    .info:has(.fq-detail-choices)>.info-last{grid-area:4/1/5/-1;min-width:0;margin-bottom:14px}
    .info:has(.fq-detail-choices)>.info-btn,.info:has(.fq-detail-choices)>.add-bookshelf-btn,.info:has(.fq-detail-choices)>.download-icon{position:relative!important;left:auto!important;right:auto!important;top:auto!important;bottom:auto!important;margin:0!important;align-self:center}
    .info:has(.fq-detail-choices)>.info-btn{grid-area:5/1/6/2}
    .info:has(.fq-detail-choices)>.add-bookshelf-btn{grid-area:5/2/6/3}
    .info:has(.fq-detail-choices)>.download-icon{grid-area:5/3/6/4;justify-self:start}
    .info>.fq-detail-choices{grid-area:6/1/7/-1;padding-top:12px}
    .info>.fq-detail-feedback{grid-area:7/1/8/-1}
    .info>.fq-detail-feedback:not(:empty){padding-top:6px}
  `;document.head.append(layoutStyle);
  const navChoice=document.createElement('div');navChoice.className='nav-item';
  const navLink=document.createElement('a');navLink.href='#fq-my-books';navLink.textContent='我的选书';navChoice.append(navLink);
  navLink.onclick=e=>{e.preventDefault();if(drawerTab)closeDrawer();else openDrawer('later');};
  const cq=id=>cs.getElementById(id);
  const official=createOfficialShelfClient({fetchImpl:(...args)=>fetch(...args),csrf:()=>document.cookie.split(';').map(s=>s.trim()).find(s=>s.startsWith('passport_csrf_token='))?.split('=').slice(1).join('=')||''});
  let syncAccount='',syncRows=new Map(),officialRows=null,syncBusy=false,syncLoading=false,syncGeneration=0;
  const selectedCandidates=new Set();
  const candidateRows=()=>[...choices.values()].filter(r=>r.state==='later'&&(!cq('query').value.trim()||(r.title+' '+r.author).toLowerCase().includes(cq('query').value.trim().toLowerCase()))&&reviewMatches(r));
  function syncStatus(id){
    const known=syncRows.get(id),remote=officialRows?.find(r=>String(r.book_id)===id);
    if(official.inTarget(remote))return {status:'success',label:'已同步到官方待看'};
    if(known?.status==='success')return officialRows?{status:'pending',label:'待同步'}:{status:'success',label:'已同步（上次核验）'};
    if(known?.status==='failed')return {status:'failed',label:known.message||'同步失败，请重试'};
    if(['queued','syncing'].includes(known?.status))return {status:syncBusy?known.status:'failed',label:syncBusy?(known.message||'等待同步'):'上次同步未完成，点击重试核验'};
    return {status:'pending',label:'待同步'};
  }
  async function loadSyncRecords(){const accountId=syncAccount;if(accountId){const rows=await historyCall({action:'syncList',accountId});if(accountId===syncAccount)syncRows=new Map(rows.map(r=>[r.id,r]));}}
  async function refreshOfficial(){
    if(syncBusy||syncLoading)return;syncLoading=true;const generation=++syncGeneration;renderChoices();
    try{const accountId=await official.account();const rows=await official.read();if(generation!==syncGeneration)return;if(syncAccount!==accountId)selectedCandidates.clear();syncAccount=accountId;officialRows=rows;await loadSyncRecords();cq('sync-message').textContent='已核对官方书架；仅点击同步时才会写入。';}
    catch(error){syncAccount='';officialRows=null;syncRows.clear();cq('sync-message').textContent=error.message;}
    finally{syncLoading=false;renderChoices();}
  }
  async function syncRecord(id,status,message='',groupId=''){const row=await historyCall({action:'syncSave',accountId:syncAccount,id,status,message,groupId});syncRows.set(id,row);renderChoices();}
  function renderSyncTools(){
    cq('official-tools').hidden=cq('filter').value!=='later';
    for(const id of selectedCandidates)if(choices.get(id)?.state!=='later')selectedCandidates.delete(id);
    cq('sync-batch').textContent='加入官方待看（'+selectedCandidates.size+'）';
    cq('sync-batch').disabled=syncBusy||syncLoading||!selectedCandidates.size;
    cq('sync-select').disabled=syncBusy||syncLoading;
    cq('sync-refresh').disabled=syncBusy||syncLoading;
    cq('sync-retry').disabled=syncBusy||syncLoading||!candidateRows().some(r=>syncStatus(r.id).status==='failed');
  }
  function addSyncControls(row,el){
    const current=syncStatus(row.id),check=document.createElement('input');check.type='checkbox';check.className='candidate-check';check.checked=selectedCandidates.has(row.id);check.disabled=syncBusy||syncLoading||current.status==='success';check.setAttribute('aria-label','选择候选：'+row.title);check.onchange=()=>{check.checked?selectedCandidates.add(row.id):selectedCandidates.delete(row.id);renderChoices();};el.prepend(check);
    const line=document.createElement('div');line.className='sync-state';line.dataset.status=current.status;line.textContent=current.label;el.append(line);
    const action=document.createElement('button');action.className='sync-one';action.textContent=current.status==='success'?'已同步':current.status==='failed'?'重试加入官方待看':'加入官方待看';action.disabled=syncBusy||syncLoading||current.status==='success';action.onclick=()=>prepareSync([row.id]);el.append(action);
  }
  async function prepareSync(ids){
    if(syncBusy||syncLoading)return;
    ids=[...new Set(ids)].filter(id=>choices.get(id)?.state==='later');if(!ids.length)return;
    if(!navigator.locks?.request){cq('sync-message').textContent='当前浏览器不支持安全的跨标签页同步，请使用新版 Chrome。';return;}
    syncBusy=true;cq('sync-review').hidden=true;renderChoices();
    try{
      const accountId=await official.account();const rows=await official.read();syncAccount=accountId;officialRows=rows;await loadSyncRecords();
      const allowed=new Map(),conflicts=[];
      for(const id of ids){const row=rows.find(r=>String(r.book_id)===id);if(row?.group_id&&!official.inTarget(row)){allowed.set(id,String(row.group_id));conflicts.push({title:choices.get(id).title,group:row.group_name||'未命名分组'});}}
      if(conflicts.length){
        const panel=cq('sync-review');panel.replaceChildren();const text=document.createElement('p');text.textContent='以下 '+conflicts.length+' 本已在其他官方分组。继续会移到“待看”：';panel.append(text);
        const list=document.createElement('ul');for(const item of conflicts){const li=document.createElement('li');li.textContent=item.title+'（'+item.group+'）';list.append(li);}panel.append(list);
        const yes=document.createElement('button');yes.textContent='移动并继续';yes.onclick=()=>{panel.hidden=true;runSync(ids,accountId,allowed);};
        const no=document.createElement('button');no.textContent='取消';no.onclick=()=>{panel.hidden=true;syncBusy=false;cq('sync-message').textContent='已取消，官方书架未改动。';renderChoices();};panel.append(yes,no);panel.hidden=false;
        cq('sync-message').textContent='等待确认移动分组';renderChoices();return;
      }
      await runSync(ids,accountId,allowed);
    }catch(error){cq('sync-message').textContent=error.message;syncBusy=false;renderChoices();}
  }
  async function runSync(ids,accountId,allowed){
    let done=0,failed=0;cq('sync-message').textContent='正在等待同步，请保持此页面打开…';
    try{
      await navigator.locks.request('fq-official-shelf-sync',async()=>{
        for(const id of ids)await syncRecord(id,'queued','等待同步');
        for(const id of ids){
          try{
            const current=(await historyCall({action:'choices'})).find(r=>r.id===id);if(current?.state!=='later')throw Error('已不在候选清单，本次未同步。');
            await syncRecord(id,'syncing','正在核对官方书架');
            const result=await official.syncOne(id,{accountId,allowedGroup:allowed.get(id)||'',onStage:stage=>syncRecord(id,'syncing',({adding:'正在加入官方书架',moving:'正在移入官方待看',verifying:'正在核验保存结果'})[stage])});
            if(officialRows){officialRows=officialRows.filter(r=>String(r.book_id)!==id);officialRows.push({book_id:id,group_id:result.groupId,group_name:'待看'});}await syncRecord(id,'success','已同步到官方待看',result.groupId);selectedCandidates.delete(id);done++;
          }catch(error){failed++;try{await syncRecord(id,'failed',error.message);}catch{cq('sync-message').textContent='本地同步状态保存失败，请刷新后核对官方书架。';throw error;}}
          cq('sync-message').textContent='已处理 '+(done+failed)+' / '+ids.length+' 本；成功 '+done+' 本，失败 '+failed+' 本。';
        }
      });
      officialRows=null;
    }catch(error){cq('sync-message').textContent='同步已停止：'+error.message;officialRows=null;}
    finally{syncBusy=false;renderChoices();}
  }
  cq('sync-select').onclick=()=>{const ids=candidateRows().filter(r=>syncStatus(r.id).status!=='success').map(r=>r.id),all=ids.every(id=>selectedCandidates.has(id));for(const id of ids)all?selectedCandidates.delete(id):selectedCandidates.add(id);renderChoices();};
  cq('sync-batch').onclick=()=>prepareSync([...selectedCandidates]);
  cq('sync-retry').onclick=()=>prepareSync(candidateRows().filter(r=>syncStatus(r.id).status==='failed').map(r=>r.id));
  cq('sync-refresh').onclick=refreshOfficial;
  const syncStyle=document.createElement('style');syncStyle.textContent='.candidate-check{width:auto;margin-right:8px;accent-color:#ff5f16}.sync-toolbar{display:flex;flex-wrap:wrap;gap:6px}.sync-one{color:#d64c0b!important}.sync-state{font-size:12px;color:#777;margin:8px 0 2px}.sync-state[data-status=success]{color:#287541}.sync-state[data-status=failed]{color:#b23b2b}#sync-review{background:#fff5ec;border:1px solid #ffdcc3;border-radius:8px;padding:12px}#sync-review ul{max-height:180px;overflow:auto}#official-tools p{font-size:13px;color:#777}';cs.append(syncStyle);
  const stateLabel=state=>({later:'已加入候选',skip:'不想看',none:'未标记'}[state]||'未标记');
  function choiceButtons(book,parent) {
    for(const [state,label] of [['later','候选'],['skip','不想看'],['none','清除标记']]){
      const b=document.createElement('button');b.type='button';b.textContent=label;b.dataset.choice=state;b.style.cssText='font:12px/1.4 system-ui;cursor:pointer;padding:2px 5px;margin:2px;border:1px solid #d6d3d1;border-radius:5px;background:#fff;color:#54443b';
      b.onclick=async e=>{e.preventDefault();e.stopPropagation();await choose(book,state);};parent.append(b);
    }
  }
  async function choose(book,state,{quiet=false}={}) {
    if(choiceBusy)return false;choiceBusy=true;
    const prior=choices.get(book.id)?.state||'none';
    if(!book.cover){const source=[...document.querySelectorAll(CARD)].find(c=>c.querySelector('a[href*="/page/"]')?.getAttribute('href')?.match(/\/page\/(\d+)/)?.[1]===book.id);book={...book,cover:safeCover(source?.querySelector('img')?.getAttribute('src')||document.querySelector('.page-header .book-cover-img')?.getAttribute('src'))};}
    try {
      const row=await historyCall({action:'choose',book,state});choices.set(book.id,row);
      suppressAutoUntil=Date.now()+1500;scan();renderChoices();
      cq('msg').replaceChildren(document.createTextNode('已保存：'+stateLabel(state)+'。'));
      const undo=document.createElement('button');undo.textContent='撤销';undo.onclick=()=>choose(book,prior);cq('msg').append(undo);
      if(detailBook()){detailFeedback.replaceChildren(document.createTextNode('已保存：'+stateLabel(state)+'。'));const back=undo.cloneNode(true);back.onclick=()=>choose(book,prior);detailFeedback.append(back);}
      return true;
    } catch {if(quiet)return false;const error='保存失败，请重试；原标记未改变。';cq('msg').textContent=error;if(detailBook())detailFeedback.textContent=error;else if(drawerReady){openDrawer(prior==='skip'?'skip':'later');}else{choiceListOpen=true;renderChoices();}}
    finally{choiceBusy=false;}
  }
  function detailBook(){const id=location.pathname.match(/^\/page\/(\d+)/)?.[1];const title=document.querySelector('h1')?.textContent.trim();return id&&title?{id,title,abstract:document.querySelector('.page-abstract-content')?.textContent||'',author:document.querySelector('.author-name')?.textContent.trim()||''}:null;}
  function renderChoices(){
    const detail=detailBook();
    const libraryLink=document.querySelector('a[href="/library"]');
    if(libraryLink?.parentElement?.parentElement&&!navChoice.isConnected)libraryLink.parentElement.after(navChoice);
    const anchor=drawerReady?null:detail?(document.querySelector('.page-header')||document.querySelector('.page-header-info')):document.querySelector('.muye-stack-book-list:not([data-fq-stream])');
    if(anchor&&!choiceHost.isConnected)anchor.before(choiceHost);
    if(anchor&&choiceHost.parentElement!==anchor.parentElement)anchor.before(choiceHost);
    choiceHost.hidden=drawerReady?!['later','skip'].includes(drawerTab):!choiceListOpen||(!supportedPage()&&!detail);choiceHost.style.display=choiceHost.hidden?'none':'block';cq('box').hidden=false;cq('open').hidden=true;cq('current').hidden=true;
    detailActions.replaceChildren();
    const original=document.querySelector('.add-bookshelf-btn');
    if(detail&&original){
      if(detailActions.previousElementSibling!==original)original.after(detailActions);
      if(!detailFeedback.isConnected||detailFeedback.parentElement!==original.parentElement)original.parentElement.append(detailFeedback);
      choiceButtons(detail,detailActions);
      const state=choices.get(detail.id)?.state||'none';
      detailActions.querySelectorAll('button').forEach(b=>{b.className='byte-btn byte-btn-default byte-btn-size-large byte-btn-shape-square muye-button';b.style.cssText='position:static;padding:0 14px;min-width:70px;width:auto!important;margin:0;height:32px;cursor:pointer;background:#f6f6f6;color:#333;border:1px solid #dedede';b.setAttribute('aria-pressed',String(b.dataset.choice===state));if(b.dataset.choice===state&&state!=='none'){b.textContent=state==='later'?'已加入候选':'已设为不想看';b.style.color='#fa6725';b.style.borderColor='#fa6725';}if(b.dataset.choice==='none'){b.hidden=state==='none';if(b.hidden)b.style.display='none';}});
    }else{detailActions.remove();detailFeedback.remove();}
    const mode=cq('filter').value,q=cq('query').value.trim().toLowerCase();
    choiceHost.dataset.review=String(mode==='later');
    cq('review-filter').hidden=mode!=='later';cq('review-reader').hidden=mode!=='later';
    if(mode==='later'){renderCandidateReview();renderSyncTools();return;}
    reviewListMode=false;
    const fragment=document.createDocumentFragment();
    for(const row of [...choices.values()].filter(r=>r.state===mode&&(!q||(r.title+' '+r.author).toLowerCase().includes(q))).sort((a,b)=>b.updatedAt-a.updatedAt)){
      const el=document.createElement('div'),a=document.createElement('a');a.href='/page/'+row.id;a.target='_blank';a.rel='noopener noreferrer';a.textContent=row.title;el.append(a);
      const meta=document.createElement('div');const matched=config.words.filter(w=>normalize(w)&&[row.title,config.abstract?row.abstract||'':''].some(t=>normalize(t).includes(normalize(w))));meta.textContent=(row.author||'')+(matched.length?' · 命中关键词：'+matched.join('、'):'');el.append(meta);choiceButtons(row,el);if(mode==='later')addSyncControls(row,el);fragment.append(el);
    }cq('rows').replaceChildren(fragment);if(!cq('rows').children.length)cq('rows').textContent='暂无记录';renderSyncTools();
  }
  cq('open').onclick=()=>{choiceListOpen=true;renderChoices();};cq('close').onclick=()=>{if(drawerReady)closeDrawer();else{choiceListOpen=false;renderChoices();}};
  cq('filter').onchange=renderChoices;cq('query').oninput=renderChoices;
  // Candidate review keeps rows and the reader mounted during status/metadata updates.
  let reviewActive='',reviewListMode=false,reviewPreviousIds=[];
  const reviewNodes=new Map(),reviewData=new Map(),reviewLoadState=new Map(),reviewFetches=new Map(),noteDrafts=new Map(),noteSaving=new Set();
  const reviewQueue=new Set(),reviewHydrationTried=new Set();let reviewHydrating=0;
  const reviewSearch=document.createElement('div');reviewSearch.id='review-search';cq('query').before(reviewSearch);reviewSearch.append(cq('query'));
  const reviewFilter=document.createElement('div');reviewFilter.id='review-filter';
  reviewFilter.innerHTML='<label>同步状态 <select id="review-status"><option value="all">全部候选</option><option value="pending">未同步</option><option value="success">已同步</option><option value="failed">同步失败</option></select></label><span id="review-count"></span>';
  reviewSearch.append(reviewFilter);
  const reviewLayout=document.createElement('div');reviewLayout.id='review-layout';
  cq('rows').before(reviewLayout);reviewLayout.append(cq('rows'));cq('rows').setAttribute('data-review-scroll','');
  cq('rows').setAttribute('aria-label','候选书籍列表');
  const reader=document.createElement('section');reader.id='review-reader';reader.setAttribute('aria-label','候选简介阅读区');
  reader.innerHTML='<div id="review-empty">从左侧选择一本候选，查看完整简介</div><div id="review-content" hidden><header><div id="review-book-head"><div class="review-cover reader-cover"><span class="cover-placeholder">暂无封面</span><img id="review-cover" alt="" hidden><span id="review-badge" class="review-badge"></span></div><div><span class="review-eyebrow">候选复筛</span><h2 id="review-title"></h2><p id="review-author"></p><p id="review-meta"></p></div></div><div class="review-statusline"><span id="review-load" role="status"></span><button id="review-reload">重试读取</button></div></header><div id="review-text" data-review-scroll tabindex="0" aria-label="完整简介"></div><div id="review-note"><button id="note-toggle" aria-expanded="false">＋ 留下一句备注（可选）</button><div id="note-editor" hidden><textarea id="note-input" maxlength="2000" placeholder="为什么留下它？例如：设定感兴趣，想先试几章。" aria-label="候选备注"></textarea><div class="note-toolbar"><span id="note-message" role="status"></span><button id="note-latest" hidden>载入另一页的备注</button><button id="note-save">保存备注</button></div></div></div><footer><button id="review-sync" class="primary">加入官方待看</button><button id="review-skip">不想看</button><button id="review-remove">移出候选</button><a id="review-detail" target="_blank" rel="noopener noreferrer">查看详情 ↗</a></footer></div>';
  reviewLayout.append(reader);for(const id of ['note-input','review-title','review-meta','review-book-head'])cq(id).setAttribute('data-review-scroll','');
  const reviewStyle=document.createElement('style');
  reviewStyle.textContent=[
    ':host([data-review=true]) #review-search{display:flex;align-items:center;gap:14px;flex-shrink:0;margin-bottom:8px}:host([data-review=true]) #review-filter{margin:0;flex-shrink:0}#review-count{white-space:nowrap}#review-filter label{white-space:nowrap}:host([data-review=true]) .sync-toolbar button{font-size:12px;padding:5px 8px;margin:0}',
    ':host([data-review=true]) #box{height:100%;display:flex;flex-direction:column;padding:6px 0 0!important;min-height:0}',
    ':host([data-review=true]) #query{margin:0!important;flex:1;min-width:120px;width:auto}',
    '#review-filter{display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:12px;color:#887b71;margin-bottom:6px}#review-filter select{padding:5px 10px;border:1px solid #e8ded7;border-radius:6px;background:#fff;color:#51463f}',
    ':host([data-review=true]) #official-tools{flex-shrink:0;padding-bottom:8px}:host([data-review=true]) #official-tools>p:first-child{display:none}',
    ':host([data-review=true]) #sync-message{height:20px;margin:4px 0 0;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    ':host([data-review=true]) #msg{height:24px;flex-shrink:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#msg:empty{visibility:hidden}',
    ':host([data-review=true]) #review-layout{flex:1;min-height:0;display:grid;grid-template-columns:minmax(300px,42%) minmax(0,1fr);border-top:1px solid #eee8e3}',
    ':host([data-review=true]) #rows{overflow:auto;overscroll-behavior:contain;overflow-anchor:none;scrollbar-gutter:stable;min-height:0;padding-right:12px}',
    ':host([data-review=true]) #rows>.review-row{display:grid;grid-template-columns:20px 76px minmax(0,1fr);grid-template-rows:1fr auto;gap:6px 10px;padding:14px 8px!important;min-height:140px;border-bottom:1px solid #eee8e3;border-left:3px solid transparent;background:white}',
    ':host([data-review=true]) #rows>.review-row[data-active=true]{background:#fff7f0;border-left-color:#ed6b32}:host([data-review=true]) #rows>.review-row:hover{background:#fffbf7}',
    '.review-row>.candidate-check{grid-column:1;grid-row:1;align-self:start;margin:5px 0;width:15px;height:15px}',
    '.review-cover{position:relative;display:block;width:76px;height:104px;overflow:hidden;flex-shrink:0;background:linear-gradient(145deg,#f0e4d7,#e0d2c5);border:1px solid #e8dfd8;border-radius:6px;padding:0!important;margin:0!important;box-shadow:0 3px 8px #3925140d}',
    '.review-row>.review-cover{grid-column:2;grid-row:1/3}.review-cover img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}.cover-placeholder{height:100%;display:flex;align-items:center;justify-content:center;font-size:12px;color:#8a7767}',
    '.review-badge{position:absolute;right:3px;top:4px;max-width:calc(100% - 6px);border:1px solid #ffffffb3;border-radius:5px;padding:2px 5px;line-height:1.5;font-size:10px;font-weight:600;color:#514a42;background:#ffffffe6;backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);box-shadow:0 1px 5px #0002;white-space:nowrap}',
    '.review-badge[data-status=success]{color:#21573e;background:#e5f7ede6}.review-badge[data-status=failed]{color:#a23e29;background:#fff0e8ed}.review-badge[data-status=syncing],.review-badge[data-status=queued]{color:#a3571f;background:#fff2dce6}',
    '.review-row-main{grid-column:3;min-width:0}.review-open{display:block;text-align:left;border:0;background:transparent!important;margin:0!important;padding:0!important;color:#302721;font-size:14px;line-height:1.6;font-weight:600;max-width:100%;overflow-wrap:anywhere}',
    '.review-row-author,.review-row-meta{font-size:12px;color:#8b8077;line-height:1.6;margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.review-row-meta{color:#a0958c}.review-row-snippet{font-size:12px;color:#71675f;margin-top:5px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;line-height:1.6}.review-row-note{min-height:18px;font-size:11px;color:#ad6d43;margin-top:4px}',
    '.review-row>.sync-one{grid-column:3;justify-self:start;font-size:11px;margin:0;padding:3px 7px;background:#fff;border-color:#ead8cb}.review-row>.sync-state{display:none}',
    '#review-reader{min-width:0;min-height:0;border-left:1px solid #eee8e3;padding-left:20px;overflow:hidden}#review-empty{display:grid;height:100%;place-content:center;text-align:center;color:#9b8d82;padding:20px}',
    '#review-content{height:100%;display:flex;flex-direction:column;min-height:0}#review-content>header{padding:14px 0 9px;flex-shrink:0}#review-book-head{display:flex;gap:16px;align-items:center;min-width:0}#review-book-head>div:last-child{min-width:0}',
    '.reader-cover{width:84px;height:114px}.review-eyebrow{font-size:10px;color:#b07955;letter-spacing:2px}#review-title{display:block!important;font-size:18px;line-height:1.5;color:#33291f;margin:5px 0;max-height:54px;overflow:auto;overscroll-behavior:contain}#review-author,#review-meta{font-size:12px;color:#897b70;margin:3px 0}#review-meta{max-height:38px;overflow:auto;overscroll-behavior:contain}',
    '.review-statusline{display:flex;align-items:center;justify-content:space-between;height:26px;font-size:11px;color:#a29285}#review-reload{border:0;font-size:11px;padding:0 3px;background:transparent;color:#ba653b}',
    '#review-text{flex:1;min-height:30px;overflow:auto;overscroll-behavior:contain;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.95;font-size:14px;color:#4b4037;padding:12px 12px 12px 0;scrollbar-gutter:stable;border-top:1px solid #f1e9e2}',
    '#review-content footer{display:flex;flex-wrap:wrap;align-items:center;gap:6px;flex-shrink:0;padding:10px 0 0;border-top:1px solid #eee8e3}#review-content footer button{margin:0;font-size:12px;padding:7px 10px}#review-content .primary{background:#f36b2a;color:white;border-color:#f36b2a}#review-content footer a{font-size:11px;margin-left:auto;color:#a75b32;text-decoration:none}',
    '#review-note{flex-shrink:0;padding:8px 0;position:relative}#note-toggle{border:0;background:transparent;padding:0;margin:0;font-size:12px;color:#a57857}#note-input{width:100%;height:62px;resize:none;border:1px solid #e6d9cc;border-radius:6px;padding:8px;font:12px/1.6 inherit;background:#fffcf8;color:#594638;overscroll-behavior:contain}#note-editor{position:absolute;left:0;right:0;bottom:100%;padding:12px;background:#fffcf8;border:1px solid #e6d9cc;border-radius:8px;box-shadow:0 -4px 20px #35241414;z-index:2}.note-toolbar{display:flex;align-items:center;gap:6px;min-height:28px}#note-message{font-size:11px;color:#a57857;flex:1}#note-save,#note-latest{font-size:11px;padding:3px 7px;margin:0}',
    '#official-tools{position:relative}#sync-review{position:absolute;left:0;right:0;top:100%;z-index:4;max-height:190px;box-shadow:0 8px 24px #0002;overflow:auto;overscroll-behavior:contain}#sync-review ul{max-height:70px}button:focus-visible,a:focus-visible,textarea:focus-visible{outline:2px solid #ed884f;outline-offset:2px}',
    '@media(max-width:760px){:host([data-review=true]) #review-search{gap:6px}#review-count{display:none}:host([data-review=true]) #review-layout{grid-template-columns:minmax(160px,36%) minmax(0,1fr)}:host([data-review=true]) #rows>.review-row{grid-template-columns:17px minmax(0,1fr);gap:6px}.review-row>.review-cover{grid-column:2;grid-row:1}.review-row-main,.review-row>.sync-one{grid-column:2}.review-row>.candidate-check{grid-column:1}.review-row-snippet,.review-row-meta{display:none}#review-reader{padding-left:12px}.reader-cover{width:60px;height:82px}#review-title{font-size:15px}}',
    '@media(max-height:760px){#review-book-head{max-height:74px;overflow:auto;overscroll-behavior:contain}.review-eyebrow{display:none}.review-statusline{height:20px}#review-meta{max-height:19px}.reader-cover{width:44px;height:60px}#review-content>header{padding-top:8px}#review-title{font-size:16px;max-height:48px}#note-input{height:48px}#review-content footer{padding-top:6px}#review-content footer button{padding:5px 7px}}'
  ].join('\n');cs.append(reviewStyle);
  cq('sync-review').setAttribute('data-review-scroll','');
  function reviewMatches(row){const filter=cq('review-status')?.value||'all',status=syncStatus(row.id).status;return filter==='all'||(filter==='pending'?status!=='success':status===filter);}
  cq('review-status').onchange=()=>{selectedCandidates.clear();renderChoices();};
  function reviewSet(el,text){if(el.textContent!==text)el.textContent=text;}
  function paintCover(img,url){const next=safeCover(url);if(img.dataset.source===next)return;img.dataset.source=next;img.hidden=!next;if(next){img.loading='lazy';img.referrerPolicy='no-referrer';img.onload=()=>{img.hidden=false;};img.onerror=()=>{img.hidden=true;};img.src=next;}else img.removeAttribute('src');}
  function paintBadge(el,status){el.dataset.status=status.status;reviewSet(el,({success:'已同步',failed:'同步失败',queued:'等待同步',syncing:'同步中',pending:'未同步'})[status.status]||'未同步');el.title=status.label;}
  function makeReviewRow(row){
    const el=document.createElement('div');el.className='review-row';el.dataset.id=row.id;
    el.innerHTML='<button class="review-cover"><span class="cover-placeholder">暂无封面</span><img alt="" hidden><span class="review-badge"></span></button><div class="review-row-main"><button class="review-open"></button><div class="review-row-author"></div><div class="review-row-meta"></div><div class="review-row-snippet"></div><div class="review-row-note"></div></div>';
    addSyncControls(row,el);
    for(const b of el.querySelectorAll('.review-cover,.review-open'))b.onclick=()=>selectReview(row.id);
    el.onclick=e=>{if(!e.target.closest('button,input,a')&&!window.getSelection()?.toString())selectReview(row.id);};
    reviewNodes.set(row.id,el);return el;
  }
  function renderCandidateReview(){
    const rows=candidateRows().sort((a,b)=>b.updatedAt-a.updatedAt||a.id.localeCompare(b.id)),ids=rows.map(r=>r.id),list=cq('rows'),top=list.scrollTop;
    if(!reviewListMode){list.replaceChildren();reviewListMode=true;}
    const visibleAnchor=[...list.children].find(el=>!el.hidden&&el.getBoundingClientRect().bottom>list.getBoundingClientRect().top);
    const anchor=visibleAnchor?{el:visibleAnchor,top:visibleAnchor.getBoundingClientRect().top}:null;
    for(const el of [...list.children])if(!ids.includes(el.dataset.id))el.remove();
    for(const [index,row] of rows.entries()){
      const el=reviewNodes.get(row.id)||makeReviewRow(row),status=syncStatus(row.id);
      if(list.children[index]!==el)list.insertBefore(el,list.children[index]||null);
      const title=el.querySelector('.review-open');reviewSet(title,row.title);el.querySelector('.review-cover').setAttribute('aria-label','查看简介：'+row.title);
      reviewSet(el.querySelector('.review-row-author'),row.author||'作者信息待补充');
      reviewSet(el.querySelector('.review-row-meta'),row.meta||'字数与状态待补充');
      reviewSet(el.querySelector('.review-row-snippet'),row.abstract||'点击查看完整简介');
      reviewSet(el.querySelector('.review-row-note'),noteDrafts.get(row.id)?.dirty?'有未保存的备注':row.note?'有备注':'');
      paintCover(el.querySelector('img'),row.cover);paintBadge(el.querySelector('.review-badge'),status);
      const check=el.querySelector('.candidate-check');check.checked=selectedCandidates.has(row.id);check.disabled=syncBusy||syncLoading||status.status==='success';
      const action=el.querySelector('.sync-one');action.style.visibility=status.status==='success'?'hidden':'';action.disabled=syncBusy||syncLoading||status.status==='success';reviewSet(action,status.status==='success'?'已同步':status.status==='failed'?'重试同步':'加入官方待看');
      const line=el.querySelector('.sync-state');line.dataset.status=status.status;reviewSet(line,status.label);
      if(choiceListOpen&&drawerTab==='later'&&!safeCover(row.cover)&&!reviewHydrationTried.has(row.id)){if(reviewCoverObserver)reviewCoverObserver.observe(el);else if(index<6){reviewQueue.add(row.id);}}
    }
    list.scrollTop=top;if(anchor?.el.isConnected)list.scrollTop+=anchor.el.getBoundingClientRect().top-anchor.top;
    reviewSet(cq('review-count'),'当前 '+rows.length+' 本 · 已勾选 '+selectedCandidates.size+' 本');
    const oldIndex=Math.max(0,reviewPreviousIds.indexOf(reviewActive));
    if(!ids.includes(reviewActive))reviewActive=ids[Math.min(oldIndex,ids.length-1)]||'';
    reviewPreviousIds=ids;reviewSet(cq('review-empty'),rows.length?'从左侧选择一本候选，查看完整简介':'当前条件下没有候选。可切换筛选，或回书库继续选书。');renderReviewReader();
    for(const [id,el] of reviewNodes){el.dataset.active=String(id===reviewActive);el.querySelector('.review-open').setAttribute('aria-pressed',String(id===reviewActive));}
    if(choiceListOpen&&drawerTab==='later'){if(reviewActive&&!reviewLoadState.has(reviewActive))loadReviewBook(reviewActive);drainReviewCovers();}
  }
  const reviewCoverObserver=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{for(const e of entries)if(e.isIntersecting){reviewQueue.add(e.target.dataset.id);reviewCoverObserver.unobserve(e.target);}drainReviewCovers();},{root:cq('rows'),rootMargin:'100px'}):null;
  function drainReviewCovers(){
    if(!choiceListOpen||drawerTab!=='later')return;
    while(reviewHydrating<2&&reviewQueue.size){const id=reviewQueue.values().next().value;reviewQueue.delete(id);if(reviewHydrationTried.has(id)||!choices.get(id)||safeCover(choices.get(id).cover))continue;reviewHydrationTried.add(id);reviewHydrating++;loadReviewBook(id).finally(()=>{reviewHydrating--;drainReviewCovers();});}
  }
  async function loadReviewBook(id,force=false){
    if(reviewFetches.has(id))return reviewFetches.get(id);
    reviewLoadState.set(id,'loading');if(reviewActive===id)renderReviewReader();
    const task=(async()=>{try{
      const full=await fetchBookDetails(id,force);reviewData.set(id,full);reviewLoadState.set(id,'ready');
      try{const result=await historyCall({action:'choiceMeta',id,book:full});choices.set(id,result.row);}catch{reviewLoadState.set(id,'memory');}
    }catch{reviewLoadState.set(id,'failed');}
    finally{reviewFetches.delete(id);if(drawerTab==='later')renderChoices();}
    })();reviewFetches.set(id,task);return task;
  }
  function selectReview(id){if(!choices.has(id))return;reviewActive=id;renderCandidateReview();}
  function draftFor(row){let draft=noteDrafts.get(row.id);if(!draft||(!draft.dirty&&!noteSaving.has(row.id))){draft={value:row.note||'',revision:row.noteRevision||0,dirty:false,open:draft?.open||false,message:''};noteDrafts.set(row.id,draft);}return draft;}
  function renderReviewReader(){
    const row=choices.get(reviewActive),content=cq('review-content');cq('review-empty').hidden=!!row;content.hidden=!row;if(!row)return;
    const changed=content.dataset.id!==row.id;content.dataset.id=row.id;
    const full=reviewData.get(row.id),status=syncStatus(row.id),draft=draftFor(row),load=reviewLoadState.get(row.id);
    reviewSet(cq('review-title'),full?.title||row.title);reviewSet(cq('review-author'),full?.author||row.author||'作者信息待补充');reviewSet(cq('review-meta'),full?.meta||row.meta||'字数与连载状态待补充');
    paintCover(cq('review-cover'),full?.cover||row.cover);paintBadge(cq('review-badge'),status);
    reviewSet(cq('review-text'),full?.abstract||row.abstract||'暂无简介，点击重试读取。');if(changed)cq('review-text').scrollTop=0;
    reviewSet(cq('review-load'),load==='loading'?'正在读取完整简介…':load==='failed'?'读取失败，保留已有简介。':load==='ready'?'完整简介':load==='memory'?'完整简介已读取，信息暂未保存到本地。':'已保存的简介');
    cq('review-reload').hidden=!['failed','memory'].includes(load);cq('review-reload').disabled=load==='loading';
    cq('review-sync').disabled=syncBusy||syncLoading||status.status==='success';reviewSet(cq('review-sync'),status.status==='success'?'已同步到官方待看':status.status==='failed'?'重试加入官方待看':'加入官方待看');
    cq('review-sync').title=status.label;cq('review-detail').href='/page/'+row.id;
    cq('review-skip').disabled=choiceBusy;cq('review-remove').disabled=choiceBusy;
    cq('note-editor').hidden=!draft.open;cq('note-toggle').setAttribute('aria-expanded',String(draft.open));reviewSet(cq('note-toggle'),draft.open?'－ 收起备注':draft.dirty?'＋ 有未保存的备注':row.note?'＋ 查看备注':'＋ 留下一句备注（可选）');
    if((changed||(!draft.dirty&&!noteSaving.has(row.id)))&&cq('note-input').value!==draft.value)cq('note-input').value=draft.value;
    cq('note-save').disabled=noteSaving.has(row.id)||!draft.dirty;
    cq('note-latest').hidden=!draft.conflict;
    reviewSet(cq('note-message'),noteSaving.has(row.id)?'正在保存…':draft.message||(draft.dirty?'未保存；切换书籍会保留草稿。':row.note?'已保存在本地':'备注仅保存在本地。'));
  }
  cq('review-reload').onclick=()=>loadReviewBook(reviewActive,true);
  cq('review-sync').onclick=()=>prepareSync([reviewActive]);
  cq('review-skip').onclick=()=>{const row=choices.get(reviewActive);if(row)choose(row,'skip');};
  cq('review-remove').onclick=()=>{const row=choices.get(reviewActive);if(row)choose(row,'none');};
  cq('note-toggle').onclick=()=>{const row=choices.get(reviewActive);if(!row)return;const draft=draftFor(row);draft.open=!draft.open;renderReviewReader();};
  cq('note-input').oninput=()=>{const row=choices.get(reviewActive);if(!row)return;const draft=draftFor(row);draft.value=cq('note-input').value;draft.dirty=draft.value!==(row.note||'');draft.message='';renderReviewReader();};
  cq('note-save').onclick=async()=>{
    const id=reviewActive,row=choices.get(id);if(!row||noteSaving.has(id))return;const draft=draftFor(row),value=draft.value;noteSaving.add(id);renderReviewReader();
    try{const result=await historyCall({action:'note',id,note:value,revision:draft.revision});choices.set(id,result.row);
      if(result.conflict){draft.conflict=true;draft.message='另一页面已修改备注。草稿已保留，请先核对最新备注。';}
      else{draft.revision=result.row.noteRevision;draft.dirty=draft.value!==value;draft.conflict=false;draft.message=draft.dirty?'仍有未保存修改。':'已保存';}
    }catch{draft.message='保存失败，草稿已保留，请重试。';}
    finally{noteSaving.delete(id);renderChoices();}
  };
  cq('note-latest').onclick=()=>{const row=choices.get(reviewActive);if(!row)return;const latest=row.note||'';cq('note-input').value=latest;noteDrafts.set(row.id,{value:latest,revision:row.noteRevision||0,dirty:false,open:true,message:'已载入最新备注。'});renderReviewReader();};


  const wiredChoices=new WeakSet();

  // Book-attached preview: fixed overlay, no root overflow/scrollbar changes.
  const introHost=document.createElement('div');introHost.id='fq-intro-host';introHost.hidden=true;
  introHost.style.cssText='position:fixed;z-index:2147483500;width:500px;max-width:calc(100vw - 24px)';
  const introRoot=introHost.attachShadow({mode:'open'});
  introRoot.innerHTML='<style>:host{font:14px/1.7 system-ui,"Microsoft YaHei",sans-serif;color:#333}*{box-sizing:border-box}[hidden]{display:none!important}#frame{height:100%;display:flex;flex-direction:column;background:white;border:1px solid #f1cdb6;border-radius:10px;box-shadow:0 8px 32px #0003;overflow:hidden}header{padding:16px 18px 12px;border-bottom:1px solid #eee;flex-shrink:0}#heading{display:flex;align-items:start;gap:12px}#title{font-size:17px;line-height:1.5;flex:1;min-width:0;margin:0;max-height:76px;overflow:auto;overscroll-behavior:contain;overflow-wrap:anywhere}#meta{font-size:12px;color:#888;margin-top:6px;max-height:42px;overflow:auto;overscroll-behavior:contain}#status{font-size:12px;color:#888;margin-top:6px;min-height:20px}#body{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;padding:16px 18px;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.85}footer{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:12px 18px;border-top:1px solid #eee;flex-shrink:0}button,a{font:inherit}button{border:1px solid #ddd;border-radius:6px;background:white;color:#555;padding:5px 10px;cursor:pointer}button:hover{background:#fff3eb}button:disabled{opacity:.5;cursor:default}button:focus-visible,a:focus-visible,#body:focus-visible{outline:2px solid #ff742b;outline-offset:2px}#later[aria-pressed=true]{background:#fff0e5;color:#e85d16;border-color:#ffbb8f}#retry{padding:0 5px;border:0;color:#d65216}#close{white-space:nowrap;border:0;padding:2px 0}a{color:#a55029;text-decoration:none;margin-left:auto;font-size:12px}</style><section id="frame" role="dialog" aria-labelledby="title"><header><div id="heading"><h2 id="title"></h2><button id="close" aria-label="收起简介">收起 ×</button></div><div id="meta"></div><div id="status" role="status"><span id="status-text"></span><button id="retry" hidden>重试</button></div></header><div id="body" tabindex="0" aria-label="完整简介"></div><footer><button id="later">加入候选</button><button id="skip">不想看</button><button id="clear" hidden>清除标记</button><a id="detail" target="_blank" rel="noopener noreferrer">查看详情 ↗</a></footer></section>';
  document.body.append(introHost);
  const iq=id=>introRoot.getElementById(id),introCache=new Map();
  const introStyle=document.createElement('style');introStyle.textContent='.stack-book-item.fq-intro-card{position:relative!important;overflow:visible!important}.stack-book-item[data-fq-intro-active]{outline:1px solid #ffb782;outline-offset:6px;border-radius:4px}.stack-book-item.fq-intro-card>.fq-choice-actions{position:absolute!important;left:0;top:100%;width:100%;height:34px;display:flex;align-items:center;gap:4px;padding:3px 0!important;box-sizing:border-box;white-space:nowrap}.stack-book-item.fq-intro-card>.fq-choice-actions>.fq-choice-state{display:none}.fq-intro-hitarea{cursor:pointer}.fq-intro-hitarea:focus-visible{outline:2px solid #ff742b;outline-offset:3px}.fq-intro-card>.fq-choice-actions{justify-content:flex-end}.fq-intro-card .fq-choice-actions button{flex-shrink:0}.fq-intro-card .fq-choice-actions button[hidden]{display:none!important}';document.head.append(introStyle);
  function introBook(card){const link=card.querySelector('a[href*="/page/"]');const id=link?.getAttribute('href')?.match(/\/page\/(\d+)/)?.[1];return id?{id,title:readText(card.querySelector(TITLE)),abstract:readText(card.querySelector(ABSTRACT)),author:readText(card.querySelector('.book-item-desc')).replace(/^作者[：:]\s*/,''),meta:[...card.querySelectorAll('.book-item-text>.book-item-desc')].filter(el=>!el.matches(ABSTRACT)).slice(0,2).map(readText).join(' · ')}:null;}
  function positionIntro(){
    if(!intro)return;const card=intro.card,rect=card.getBoundingClientRect();
    if(!card.isConnected||card.getAttribute(MARK)==='hide'){closeIntro(false);return;}
    const minTop=Math.max(12,document.querySelector('.muye-header')?.getBoundingClientRect().bottom||80)+12;
    if(rect.bottom<minTop||rect.top>innerHeight){closeIntro(false);return;}
    const width=Math.min(500,innerWidth-24),height=Math.max(180,Math.min(540,innerHeight-minTop-12));
    let left=rect.right+12;if(left+width>innerWidth-12)left=rect.left-width-12;
    left=Math.max(12,Math.min(left,innerWidth-width-12));
    const top=Math.max(minTop,Math.min(rect.top,innerHeight-height-12));
    introHost.style.left=left+'px';introHost.style.top=top+'px';introHost.style.width=width+'px';introHost.style.height=height+'px';
  }
  function updateIntroState(){if(!intro)return;const state=choices.get(intro.book.id)?.state||'none';iq('later').textContent=state==='later'?'已加入候选':'加入候选';iq('later').setAttribute('aria-pressed',String(state==='later'));iq('clear').hidden=state==='none';for(const id of ['later','skip','clear'])iq(id).disabled=!!intro.saving;}
  function safeCover(value){try{const u=new URL(value,location.origin);return value&&u.protocol==='https:'&&!u.pathname.includes('/novel-static/5cb03bd354145bc7815a5e09d4b15cfc')?u.href:'';}catch{return '';}}
  function pageBookData(doc,id){
    const script=[...doc.scripts].find(el=>el.textContent.includes('window.__INITIAL_STATE__='))?.textContent;if(!script)return {};
    const start=script.indexOf('window.__INITIAL_STATE__=')+'window.__INITIAL_STATE__='.length;let depth=0,quoted=false,escaped=false,end=start;
    for(;end<script.length;end++){const c=script[end];if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;}else if(c==='"')quoted=true;else if(c==='{')depth++;else if(c==='}'&&!--depth){end++;break;}}
    try{const data=parseOfficialJSON(script.slice(start,end)).page;return String(data?.bookId)===id?data:{};}catch{return {};}
  }
  async function fetchBookDetails(id,force=false){
    let cached=introCache.get(id);
    if(force||!cached||Date.now()-cached.time>600000){
      const promise=(async()=>{const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);try{
        const response=await fetch('/page/'+id,{credentials:'same-origin',cache:'no-store',signal:controller.signal});
        if(!response.ok)throw Error('请求失败');
        const doc=new DOMParser().parseFromString(await response.text(),'text/html'),body=doc.querySelector('.page-abstract-content');
        if(!body||!body.textContent.trim())throw Error('暂无完整简介');
        const data=pageBookData(doc,id);
        return {title:readText(doc.querySelector('h1')).trim(),abstract:readText(body).trim(),author:readText(doc.querySelector('.author-name')).trim(),cover:safeCover(data.thumbUri||doc.querySelector('.page-header .book-cover-img,.book-cover-img')?.getAttribute('src')),meta:[...[...doc.querySelectorAll('.info-label > *, .info-count')].map(e=>readText(e).trim()),...(!doc.querySelector('.info-label > *')?[readText(doc.querySelector('.info-label')).trim()]:[])].filter(Boolean).join(' · ')};
      }finally{clearTimeout(timer);}})();
      cached={time:Date.now(),promise};introCache.set(id,cached);if(introCache.size>60)introCache.delete(introCache.keys().next().value);
    }
    try{return await cached.promise;}catch(error){if(introCache.get(id)===cached)introCache.delete(id);throw error;}
  }
  async function loadIntro(record,force=false){
    iq('status-text').textContent='正在核对完整简介…';iq('retry').hidden=true;
    try{const full=await fetchBookDetails(record.book.id,force);if(intro!==record)return;
      iq('title').textContent=full.title||record.book.title;iq('body').textContent=full.abstract;iq('status-text').textContent='完整简介';
    }catch{if(intro!==record)return;iq('status-text').textContent=record.book.abstract?'核对失败，当前显示列表简介。':'暂时无法取得简介，可打开详情查看。';iq('retry').hidden=false;}
  }

  function openIntro(card,trigger){
    if(intro?.card===card)return;closeIntro(false);if(drawerTab)closeDrawer();
    const book=introBook(card);if(!book)return;
    const record={book,card,trigger,saving:false};intro=record;card.setAttribute('data-fq-intro-active','');trigger.setAttribute('aria-expanded','true');
    iq('title').textContent=book.title;iq('meta').textContent=book.meta;iq('body').textContent=book.abstract||'正在读取简介…';iq('body').scrollTop=0;iq('detail').href='/page/'+book.id;introHost.hidden=false;updateIntroState();positionIntro();iq('close').focus({preventScroll:true});loadIntro(record);
  }
  function closeIntro(restoreFocus=true){if(!intro)return;const previous=intro;intro=null;introHost.hidden=true;previous.card.removeAttribute('data-fq-intro-active');previous.trigger.setAttribute('aria-expanded','false');if(restoreFocus&&previous.trigger.isConnected&&previous.card.getAttribute(MARK)!=='hide')previous.trigger.focus({preventScroll:true});}
  function nearbyAnchor(card){const cards=[...document.querySelectorAll('[data-fq-stream] .stack-book-item,.muye-stack-book-list:not([data-fq-native-hidden])>.stack-book-item')].filter(e=>e!==card&&e.getBoundingClientRect().height&&e.getAttribute(MARK)!=='hide');const y=card.getBoundingClientRect().top;const el=cards.sort((a,b)=>Math.abs(a.getBoundingClientRect().top-y)-Math.abs(b.getBoundingClientRect().top-y))[0];return el?{el,top:el.getBoundingClientRect().top}:null;}
  function preserveNearby(anchor){if(anchor?.el.isConnected){const delta=anchor.el.getBoundingClientRect().top-anchor.top;if(Math.abs(delta)>.5)window.scrollBy(0,delta);}}
  function introUndo(book,prior){const box=bs.getElementById('intro-notice');box.replaceChildren(document.createTextNode('已设为不想看。'));box.hidden=false;const undo=document.createElement('button');undo.textContent='撤销';undo.onclick=async()=>{undo.disabled=true;const visible=[...document.querySelectorAll('.stack-book-item')].find(e=>e.getBoundingClientRect().top>=80&&e.getBoundingClientRect().height&&e.getAttribute(MARK)!=='hide');const anchor=visible?{el:visible,top:visible.getBoundingClientRect().top}:null;if(await choose(book,prior,{quiet:true})){preserveNearby(anchor);box.hidden=true;}else{undo.disabled=false;box.firstChild.textContent='撤销失败，请重试。';}};const dismiss=document.createElement('button');dismiss.textContent='关闭';dismiss.onclick=()=>box.hidden=true;box.append(undo,dismiss);}
  async function setIntroChoice(state){
    const record=intro;if(!record||record.saving)return;record.saving=true;updateIntroState();const prior=choices.get(record.book.id)?.state||'none',anchor=state==='skip'?nearbyAnchor(record.card):null;
    const saved=await choose(record.book,state,{quiet:true});record.saving=false;
    if(!saved){if(intro===record){iq('status-text').textContent='保存失败，请重试；原标记未改变。';updateIntroState();}return;}
    if(state==='skip'){if(intro===record)closeIntro(false);preserveNearby(anchor);introUndo(record.book,prior);}
    else if(intro===record){updateIntroState();iq('status-text').textContent=state==='later'?'已加入候选':'已清除标记';}
  }
  iq('close').onclick=()=>closeIntro();iq('retry').onclick=()=>{if(intro)loadIntro(intro,true);};iq('later').onclick=()=>setIntroChoice('later');iq('skip').onclick=()=>setIntroChoice('skip');iq('clear').onclick=()=>setIntroChoice('none');
  document.addEventListener('pointerdown',e=>{if(intro&&!e.composedPath().includes(introHost)&&!e.target.closest?.('.fq-intro-hitarea'))closeIntro(false);});
  introRoot.addEventListener('wheel',e=>{const scroller=e.composedPath().find(el=>['body','title','meta'].includes(el.id));if(!scroller||scroller.scrollHeight<=scroller.clientHeight)e.preventDefault();},{passive:false});
  introRoot.addEventListener('touchmove',e=>{const scroller=e.composedPath().find(el=>['body','title','meta'].includes(el.id));if(!scroller||scroller.scrollHeight<=scroller.clientHeight)e.preventDefault();},{passive:false});
  introRoot.addEventListener('keydown',e=>{
    if(e.key==='Escape'){e.preventDefault();closeIntro();return;}
    if(e.key==='Tab'){const items=[...introRoot.querySelectorAll('button,a[href],[tabindex="0"]')].filter(el=>!el.disabled&&el.getClientRects().length),index=items.indexOf(introRoot.activeElement);if(items.length){e.preventDefault();items[(index+(e.shiftKey?-1:1)+items.length)%items.length].focus({preventScroll:true});}}
    if(e.key===' '&&e.target.tagName!=='BUTTON'){e.preventDefault();iq('body').scrollTop+=(e.shiftKey?-1:1)*iq('body').clientHeight*.85;}
    if(['ArrowUp','ArrowDown','PageUp','PageDown','Home','End'].includes(e.key)){e.preventDefault();const body=iq('body');if(e.key==='Home')body.scrollTop=0;else if(e.key==='End')body.scrollTop=body.scrollHeight;else body.scrollTop+=(e.key.endsWith('Up')?-1:1)*(e.key.startsWith('Arrow')?40:body.clientHeight*.85);}
  });
  window.addEventListener('scroll',()=>{if(intro)closeIntro(false);},{passive:true});window.addEventListener('resize',positionIntro);

  function attachChoices(card){
    const link=card.querySelector('a[href*="/page/"]'),id=link?.getAttribute('href')?.match(/\/page\/(\d+)/)?.[1];if(!id)return;
    const book={id,title:readText(card.querySelector(TITLE)),abstract:readText(card.querySelector(ABSTRACT)),author:readText(card.querySelector('.book-item-text > .author,.book-item-text > .book-item-desc')).replace(/^作者[：:]\s*/,'')};
    if(!wiredChoices.has(card)){card.querySelectorAll('.fq-choice-actions').forEach(e=>e.remove());const controls=document.createElement('div');controls.className='fq-choice-actions';controls.style.cssText='font:12px/1.5 system-ui;clear:both;padding:6px 0;position:relative';const badge=document.createElement('span');badge.className='fq-choice-state';controls.append(badge);choiceButtons(book,controls);if(card.matches('.stack-book-item')){card.classList.add('fq-intro-card');card.append(controls);
      const text=card.querySelector('.book-item-text');
      if(text){text.classList.add('fq-intro-hitarea');text.tabIndex=0;text.setAttribute('role','group');text.setAttribute('aria-label','书籍信息，点击或按回车查看完整简介');text.setAttribute('aria-haspopup','dialog');text.setAttribute('aria-expanded','false');text.onclick=e=>{
        if(e.defaultPrevented||e.button!==0||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey||e.target.closest('a,button,input,select,textarea,[contenteditable=true]')||window.getSelection()?.toString())return;
        e.preventDefault();e.stopPropagation();if(intro?.card!==card)openIntro(card,text);
      };text.onkeydown=e=>{if(e.target===text&&(e.key==='Enter'||e.key===' ')){e.preventDefault();e.stopPropagation();openIntro(card,text);}};}
      }else (card.querySelector('.book-item-text')||card).append(controls);wiredChoices.add(card);}
    const badge=card.querySelector('.fq-choice-state'),text=stateLabel(choices.get(id)?.state);if(badge.textContent!==text)badge.textContent=text;
    if(card.matches('.stack-book-item')){const state=choices.get(id)?.state||'none';const clear=card.querySelector('[data-choice=none]');clear.hidden=state==='none';clear.textContent='清除';const later=card.querySelector('[data-choice=later]');later.textContent=state==='later'?'已候选':'候选';later.setAttribute('aria-pressed',String(state==='later'));}
    if(intro?.book.id===id)updateIntroState();
    return id;
  }
  async function refreshChoices(){try{const rows=await historyCall({action:'choices'});const stamp=JSON.stringify(rows);if(stamp!==choiceStamp){choiceStamp=stamp;choices=new Map(rows.map(r=>[r.id,r]));suppressAutoUntil=Date.now()+1500;scan();renderChoices();}}catch{}}
  if(typeof FQ_CHOICE_WATCH==='function')FQ_CHOICE_WATCH(async()=>{await refreshChoices();try{await loadSyncRecords();renderChoices();}catch{}});
  else setInterval(async()=>{await refreshChoices();try{await loadSyncRecords();if(choiceListOpen)renderChoices();}catch{}},2000);
  window.addEventListener('focus',refreshChoices);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshChoices();});
  let detailKey='';setInterval(()=>{const key=location.pathname+'|'+(document.querySelector('h1')?.textContent||'');if(key!==detailKey){detailKey=key;renderChoices();}},700);

  function scan() {
    observer.disconnect();
    try {
      const active = supportedPage();
      host.hidden = drawerReady?false:!active;
      if (!active) {
        document.querySelectorAll(`[${MARK}]`).forEach(card => card.removeAttribute(MARK));
        alignLibraryCards();
        return;
      }
      const words = config.words.map(normalize).filter(Boolean);
      const cards = [...document.querySelectorAll(CARD)].filter(card=>!card.closest('[data-fq-native-hidden]'));
      let hits = 0, unknown = 0;
      const records = [];
      for (const card of cards) {
        const fields = [readText(card.querySelector(TITLE))];
        if (config.abstract) fields.push(readText(card.querySelector(ABSTRACT)));
        if (fields.some(text => /[\ue000-\uf8ff]/u.test(text))) unknown++;
        const idForChoice=attachChoices(card);
        const keywordHit = config.enabled && fields.some(text => words.some(word => normalize(text).includes(word)));
        const hit=keywordHit||choices.get(idForChoice)?.state==='skip';
        if (hit) {
          hits++; card.setAttribute(MARK, reveal ? 'show' : 'hide');
          const bookLink = card.querySelector('a[href*="/page/"]');
          const id = bookLink?.getAttribute('href')?.match(/\/page\/(\d+)(?:[/?#]|$)/)?.[1];
          if (id && keywordHit) {
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
      if(drawerReady)updateFilterBar(cards.length,hits);
      if (typeof stream !== 'undefined') updateStreamStatus();
    } finally { observe(); }
  }

  // Infinite library stream. Native React list remains available as a fallback.
  let stream = null;
  let streamStarted = false;
  let infiniteEnabled = GM_getValue('fq-infinite-enabled', true) !== false;
  const streamStyle = document.createElement('style');
  streamStyle.textContent = '[data-fq-native-hidden]{display:none!important}.fq-stream-controls{padding:24px;text-align:center;clear:both}.fq-stream-controls button{margin:8px;padding:8px 16px;cursor:pointer}';
  document.head.append(streamStyle);
  const toggleLabel = document.createElement('label');
  const toggle = document.createElement('input'); toggle.type='checkbox'; toggle.checked=infiniteEnabled;
  toggleLabel.append(toggle,' 启用书库无限滚动');
  $('settings-view').prepend(toggleLabel);
  const routeKey = () => location.pathname + location.search;
  const setText = (el,text) => { if(el.textContent!==text) el.textContent=text; };
  function disposeStream() {
    if(!stream) return;
    stream.controller?.abort(); stream.io.disconnect(); stream.list.remove(); stream.controls.remove();
    stream.native.removeAttribute('data-fq-native-hidden'); stream.pagination?.removeAttribute('data-fq-native-hidden');
    stream=null;
  }
  toggle.onchange=async()=>{
    try { await GM_setValue('fq-infinite-enabled',toggle.checked); infiniteEnabled=toggle.checked; disposeStream(); syncStream(); scan(); }
    catch {toggle.checked=infiniteEnabled; $('warning').textContent='无限滚动设置保存失败，请重试。';}
  };
  function updateStreamStatus() {
    if(!stream) return;
    const s=stream, cards=[...s.list.children], hidden=cards.filter(c=>c.getAttribute(MARK)==='hide').length;
    const suffix=s.loading?'加载中…':s.error?'加载失败：'+s.error:s.done?'没有更多了':s.paused?'已暂停自动加载':'向下滚动加载更多';
    setText(s.status,'已加载 '+s.pages+' 页 · 展示 '+(cards.length-hidden)+' 本 · 已隐藏 '+hidden+' 本 · '+suffix);
    setText(s.pause,s.paused?'恢复自动加载':'暂停自动加载');
    s.more.disabled=s.loading||s.done;
    setText(s.more,s.error?'重试':s.empty>=3?'继续查找':'加载下一页');
  }
  function streamParams(key,page) {
    const url=new URL(key,location.origin), path=url.pathname;
    const val=re=>path.match(re)?.[1]??'-1';
    const sort={hottes:'0',newest:'1',count:'2'}[url.searchParams.get('sort')||'hottes'];
    if(sort===undefined) throw Error('无法识别当前排序，请关闭无限滚动后重试');
    return new URLSearchParams({page_count:'18',page_index:String(page-1),gender:val(/audience(\d+)/),category_id:val(/cat\d+-(\d+)/),creation_status:val(/stat(\d+)/),word_count:val(/count(\d+)/),book_type:'-1',sort});
  }
  function makeStreamCard(book,s) {
    const card=s.template.cloneNode(true);
    card.removeAttribute(MARK);card.removeAttribute('data-fq-intro-active');
    // Use textContent for all remote metadata; never execute response markup.
    const title=card.querySelector('.book-item-title');
    title.textContent=book.book_name; title.href='/page/'+book.book_id; title.target='_blank'; title.rel='noopener noreferrer';
    const text=card.querySelector('.book-item-text');
    const desc=text.querySelectorAll(':scope > .book-item-desc');
    if(desc[0]) {desc[0].textContent='作者：'+(book.author||'');desc[0].classList.add(s.font);}
    if(desc[1]) {desc[1].textContent=(Number(book.creation_status)===0?'已完结':'连载中')+' · '+(book.word_count||'字数未知');desc[1].classList.add(s.font);}
    const abstract=card.querySelector('.book-item-abstract'); if(abstract) abstract.textContent=book.abstract||'';
    const footer=card.querySelector('.book-item-footer'); if(footer) footer.textContent=book.last_chapter_time?'更新：'+new Date(Number(book.last_chapter_time)*1000).toLocaleDateString('zh-CN'):'';
    const img=card.querySelector('img');
    if(img){const u=new URL(book.thumb_url||'',location.origin); img.removeAttribute('srcset');img.removeAttribute('data-src');img.loading='lazy';img.alt=book.book_name; if(['https:','http:'].includes(u.protocol)) {u.protocol='https:';img.src=u.href;}else img.removeAttribute('src');}
    const cover=card.querySelector('.book-item-cover');if(cover) {cover.style.cursor='pointer';cover.onclick=()=>window.open('/page/'+book.book_id,'_blank','noopener');}
    card.querySelectorAll('[style]').forEach(el=>{if(el.style.opacity==='0')el.style.opacity='1';});
    return card;
  }
  async function loadStream(manual=false) {
    const s=stream;
    if(!s||s.loading||s.done||(!manual&&(s.paused||document.hidden||drawerTab||intro||Date.now()<suppressAutoUntil)))return;
    if(s.key!==routeKey())return;
    if(manual){s.empty=0;s.error='';}
    s.loading=true;updateStreamStatus();
    const delay=Math.max(0,600-(Date.now()-(s.lastRequest||0)));
    if(delay)await new Promise(r=>setTimeout(r,delay));
    if(stream!==s||s.key!==routeKey()){s.loading=false;return;}
    s.lastRequest=Date.now();
    s.controller=new AbortController();
    const timeout=setTimeout(()=>s.controller.abort(),20000);
    try {
      const response=await fetch('/api/author/library/book_list/v0/?'+streamParams(s.key,s.page+1),{signal:s.controller.signal});
      if(!response.ok)throw Error('请求失败（'+response.status+'）');
      const json=await response.json();
      if(json.code!==0||!Array.isArray(json.data?.book_list))throw Error('书库返回异常，请稍后重试');
      if(stream!==s||s.key!==routeKey()||!s.native.isConnected)return;
      const books=json.data.book_list;
      const more=json.data.has_more;
      const ended=more===false||more===0||more==='0'||(books.length===0&&more!==true&&more!==1);
      if(!books.length&&!ended)throw Error('接口未返回书籍，请重试');
      if(books.some(b=>!/^\d{5,25}$/.test(String(b.book_id))||typeof b.book_name!=='string'))throw Error('无法识别书籍信息');
      const fresh=books.filter(b=>!s.ids.has(String(b.book_id)));
      const fragment=document.createDocumentFragment();
      const pendingIds=new Set(s.ids);
      let visible=0;
      for(const book of fresh){const id=String(book.book_id);if(pendingIds.has(id))continue;const card=makeStreamCard(book,s);const fields=[readText(card.querySelector(TITLE)),config.abstract?readText(card.querySelector(ABSTRACT)):''];const hit=choices.get(id)?.state==='skip'||(config.enabled&&fields.some(t=>config.words.some(w=>normalize(w)&&normalize(t).includes(normalize(w)))));if(hit)card.setAttribute(MARK,reveal?'show':'hide');if(!hit||reveal)visible++;fragment.append(card);pendingIds.add(id);}
      s.list.append(fragment);s.ids=pendingIds;s.page++;s.pages++;s.error='';
      s.empty=visible?0:s.empty+1;
      s.done=ended;
      if(s.empty>=3)s.paused=true;
      scan();
    } catch(e) {
      if(stream===s&&s.key===routeKey()){s.error=e.name==='AbortError'?'请求超时，请重试':e.message;s.paused=true;}
    } finally {
      clearTimeout(timeout);s.loading=false;
      if(stream===s){updateStreamStatus();setTimeout(()=>{if(stream===s&&s.controls.getBoundingClientRect().top<innerHeight+500)loadStream();},800);}
    }
  }
  function syncStream() {
    if(typeof IntersectionObserver==='undefined')return;
    const native=document.querySelector('.muye-stack-book-list:not([data-fq-stream])');
    const key=routeKey();
    if(stream&&(stream.key!==key||stream.native!==native||!stream.list.isConnected))disposeStream();
    if(!infiniteEnabled||!/^\/library(?:\/|$)/.test(location.pathname)||!native?.querySelector('.stack-book-item')) {if(stream)disposeStream();return;}
    if(stream)return;
    const reseed=streamStarted; streamStarted=true;
    const list=native.cloneNode(true);list.setAttribute('data-fq-stream','');list.removeAttribute('data-fq-native-hidden');
    const cards=[...list.querySelectorAll('.stack-book-item')];
    const template=cards[0].cloneNode(true);
    const font=[...template.querySelector('.book-item-title').classList].find(c=>c.startsWith('font-'));
    if(!font||!FONTS[font.slice(5)])return;
    if(reseed)list.replaceChildren();
    else cards.forEach(card=>{const cover=card.querySelector('.book-item-cover'),link=card.querySelector('.book-item-title');if(cover&&link){cover.style.cursor='pointer';cover.onclick=()=>window.open(link.href,'_blank','noopener');}});
    const pagination=document.querySelector('.muye-stack-pagination');
    const controls=document.createElement('div');controls.className='fq-stream-controls';
    const status=document.createElement('div');status.setAttribute('role','status');
    const pause=document.createElement('button'),more=document.createElement('button');
    controls.append(status,pause,more);
    native.after(list,controls);native.setAttribute('data-fq-native-hidden','');pagination?.setAttribute('data-fq-native-hidden','');
    const ids=new Set((reseed?[]:cards).map(c=>c.querySelector('a[href*="/page/"]')?.getAttribute('href')?.match(/\/page\/(\d+)/)?.[1]).filter(Boolean));
    const page=Number(location.pathname.match(/page_(\d+)/)?.[1]||1);
    const io=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting))loadStream();},{rootMargin:'500px'});
    stream={key,native,list,controls,status,pause,more,pagination,ids,page:reseed?page-1:page,pages:reseed?0:1,template,font,io,paused:false,loading:false,done:!reseed&&!!pagination?.querySelector('.byte-pagination-item-icon:last-child.disabled'),empty:0,error:''};
    pause.onclick=()=>{stream.paused=!stream.paused;updateStreamStatus();if(!stream.paused)loadStream();};
    more.onclick=()=>loadStream(true);
    io.observe(controls);scan();updateStreamStatus();if(reseed)loadStream(true);
  }
  setInterval(syncStream,700);


  // One in-page management drawer; existing storage keys and panel handlers are retained.
  const filterBar=document.createElement('div');filterBar.id='fq-filter-bar';
  filterBar.style.cssText='position:sticky;top:80px;z-index:100;background:white;max-width:1160px;margin:16px auto;border-bottom:1px solid #eee';
  const bs=filterBar.attachShadow({mode:'open'});
  bs.innerHTML='<style>:host{font:14px/1.6 system-ui;color:#333}#bar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:12px 8px;background:#fff}button{font:inherit;color:#555;background:#fff;border:1px solid #ddd;border-radius:6px;padding:5px 10px;cursor:pointer}label{white-space:nowrap}input{accent-color:#ff5f16}#summary{font-size:12px;color:#777}#error{color:#a33}#keyword-tags{display:flex;gap:6px;flex-wrap:wrap;padding:0 8px 12px;max-height:84px;overflow:auto;overscroll-behavior:contain}#keyword-tags:empty{display:none}.keyword-tag{background:#fff2e9;color:#a54313;border-radius:5px;padding:2px 8px;overflow-wrap:anywhere;max-width:100%}#words{max-width:250px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}</style><div id="bar"><label><input id="enabled" type="checkbox">关键词过滤</label><button id="words"></button><label><input id="abstract" type="checkbox">匹配简介</label><button id="reveal">临时显示隐藏书籍</button><button id="records">屏蔽记录</button><button id="browse">浏览设置</button><span id="summary"></span><span id="error" role="status"></span></div><div id="keyword-tags" role="list" aria-label="当前生效的屏蔽词"></div>';
  const bq=id=>bs.getElementById(id);
  const introNotice=document.createElement('div');introNotice.id='intro-notice';introNotice.hidden=true;introNotice.style.cssText='position:absolute;top:100%;left:0;padding:8px 12px;background:#fff7ef;border:1px solid #ffd8b9;border-radius:6px;box-shadow:0 4px 12px #0001';bs.append(introNotice);
  const overlayStyle=document.createElement('style');
  overlayStyle.textContent=`
    #fq-drawer[hidden]{display:none!important}
    #fq-drawer{position:fixed;inset:0;z-index:2147483600;background:#0004;font:14px/1.6 system-ui;color:#333}
    #fq-drawer-dialog{position:absolute;top:80px;left:50%;transform:translateX(-50%);width:min(1120px,calc(100vw - 40px));max-height:min(75dvh,calc(100dvh - 104px));display:flex;flex-direction:column;background:#fff;border-radius:0 0 12px 12px;box-shadow:0 12px 40px #0002;overflow:hidden}
    #fq-drawer-head{display:flex;align-items:center;justify-content:space-between;padding:16px 24px;border-bottom:1px solid #eee}
    #fq-drawer-tabs{display:flex;gap:12px;flex-wrap:wrap;padding:0 24px;border-bottom:1px solid #eee}
    #fq-drawer button{font:inherit;cursor:pointer}
    #fq-drawer-tabs button{border:0;background:transparent;padding:12px;color:#666}
    #fq-drawer-tabs button[aria-selected=true]{color:#ee642d;border-bottom:2px solid #ee642d}
    #fq-drawer-close{border:0;background:transparent;padding:4px 12px;font-size:20px}
    #fq-drawer[data-review=true] #fq-drawer-dialog{height:min(86dvh,calc(100dvh - 104px));max-height:none;width:min(1220px,calc(100vw - 40px))}
    #fq-drawer[data-review=true] #fq-drawer-head{padding:10px 20px}
    #fq-drawer[data-review=true] #fq-drawer-tabs button{padding:8px 12px}
    #fq-drawer[data-review=true] #fq-drawer-body{flex:1;overflow:hidden;padding:0 20px 16px;display:flex}
    #fq-drawer[data-review=true] #fq-choice-host{height:100%;min-height:0}
    #fq-drawer-body{overflow:auto;overscroll-behavior:contain;min-height:0;padding:4px 24px 20px}
    #fq-drawer-body>#fq-keyword-filter-host,#fq-drawer-body>#fq-choice-host{position:static!important;margin:0!important;width:100%!important;max-width:none!important}
  `;document.head.append(overlayStyle);
  drawer=document.createElement('div');drawer.id='fq-drawer';drawer.hidden=true;
  drawer.innerHTML='<section id="fq-drawer-dialog" role="dialog" aria-modal="true" aria-labelledby="fq-drawer-title"><div id="fq-drawer-head"><strong id="fq-drawer-title">我的选书与筛选</strong><button id="fq-drawer-close" aria-label="关闭">×</button></div><div id="fq-drawer-tabs" role="tablist"></div><div id="fq-drawer-body"></div></section>';
  document.body.append(drawer);
  const drawerBody=drawer.querySelector('#fq-drawer-body');drawerBody.append(choiceHost,host);
  host.style.cssText='display:none';choiceHost.style.cssText='display:none';
  const ruleStyle=document.createElement('style');ruleStyle.textContent='#open,h2,#history-back,#history-close,#close{display:none!important}#panel,#panel[data-view=history]{width:100%;max-height:none;overflow:visible;border:0;box-shadow:none;background:white;padding:16px 0;margin:0}#history-list{max-height:none;overflow:visible}#save{background:#ff5f16;border-color:#ff5f16}input{accent-color:#ff5f16}textarea{overscroll-behavior:contain}#history-open{display:none}#word-tags{display:flex;flex-wrap:wrap;gap:8px;max-height:180px;overflow:auto;overscroll-behavior:contain;padding:3px}.word-tag{display:inline-flex;align-items:center;gap:8px;background:#fff2e9;border:1px solid #ffdcc3;border-radius:6px;padding:4px 8px;color:#a54313;max-width:100%;overflow-wrap:anywhere}.word-tag button{border:0;background:transparent;color:#a54313;padding:0 4px;line-height:24px}.word-tag button:hover{background:#ffddc7}#words{height:86px}#word-preview,#word-feedback,.empty-words{font-size:13px;color:#777}';shadow.append(ruleStyle);
  const listStyle=document.createElement('style');listStyle.textContent='#box{border:0;padding:16px 0}#box>strong,#close,#filter{display:none!important}#query{padding:9px;border:1px solid #ddd;border-radius:6px;margin:8px 0}#rows>div{padding:14px 0}';cs.append(listStyle);
  for(const [key,label] of [['later','候选'],['skip','不想看'],['rules','关键词规则'],['history','屏蔽记录']]){const button=document.createElement('button');button.textContent=label;button.dataset.tab=key;button.setAttribute('role','tab');button.onclick=()=>openDrawer(key);drawer.querySelector('#fq-drawer-tabs').append(button);}
  function openDrawer(tab){
    closeIntro(false);
    const opening=!drawerTab;
    if(opening){drawerReturn=document.activeElement;while(drawerReturn?.shadowRoot?.activeElement)drawerReturn=drawerReturn.shadowRoot.activeElement;}
    drawerTab=tab;drawer.dataset.review=String(tab==='later');drawer.hidden=false;host.hidden=false;host.style.display=['rules','history'].includes(tab)?'block':'none';choiceListOpen=['later','skip'].includes(tab);
    drawer.querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.tab===tab)));
    if(choiceListOpen){cq('filter').value=tab;renderChoices();if(tab==='later'&&(opening||!syncAccount))refreshOfficial();}
    else {choiceHost.style.display='none';$('panel').hidden=false;showHistory(tab==='history');if(tab==='rules'&&!drawerRulesLoaded){resetWordDraft();$('enabled').checked=config.enabled;$('abstract').checked=config.abstract;drawerRulesLoaded=true;}}
    drawerBody.scrollTop=0;
    if(opening)drawer.querySelector('#fq-drawer-close').focus({preventScroll:true});
  }
  function closeDrawer(){
    if(!drawerTab)return;if(!cq('sync-review').hidden){cq('sync-review').hidden=true;syncBusy=false;}drawerTab=null;drawerRulesLoaded=false;drawer.hidden=true;choiceListOpen=false;historyView=false;
    host.style.display='none';choiceHost.style.display='none';$('panel').hidden=true;
    drawerReturn?.focus?.({preventScroll:true});
  }
  drawer.querySelector('#fq-drawer-close').onclick=closeDrawer;
  drawer.onclick=e=>{if(e.target===drawer)closeDrawer();};
  // Do not change root overflow: the site's scroll container resets when it changes.
  // Only the drawer may consume scrolling while it is open.
  drawer.addEventListener('wheel',e=>{
    const scroller=e.composedPath().find(el=>el?.matches?.('[data-review-scroll]'))||drawerBody;if(!e.composedPath().includes(scroller)||scroller.scrollHeight<=scroller.clientHeight)e.preventDefault();
  },{passive:false});
  drawer.addEventListener('touchmove',e=>{
    const scroller=e.composedPath().find(el=>el?.matches?.('[data-review-scroll]'))||drawerBody;if(!e.composedPath().includes(scroller)||scroller.scrollHeight<=scroller.clientHeight)e.preventDefault();
  },{passive:false});
  drawer.addEventListener('keydown',e=>{
    const target=e.composedPath()[0];
    const editable=target.matches?.('input,textarea,select,[contenteditable=true]');
    if(!editable&&['ArrowDown','ArrowUp','PageDown','PageUp','Home','End',' '].includes(e.key)&&!(e.key===' '&&target.matches?.('button'))){
      e.preventDefault();const scrollArea=target.closest?.('[data-review-scroll]')||drawerBody,step=e.key.startsWith('Arrow')?40:scrollArea.clientHeight*0.85;
      if(e.key==='Home')scrollArea.scrollTop=0;else if(e.key==='End')scrollArea.scrollTop=scrollArea.scrollHeight;
      else scrollArea.scrollTop+=(['ArrowUp','PageUp'].includes(e.key)||(e.key===' '&&e.shiftKey)?-step:step);
    }
    if(e.key==='Escape'){e.preventDefault();closeDrawer();}
    if(e.key==='Tab'){
      const roots=[drawer,shadow,cs];const items=roots.flatMap(r=>[...r.querySelectorAll('button,input,textarea,select,a[href],[tabindex="0"]')]).filter(el=>!el.disabled&&el.getClientRects().length);
      const current=shadow.activeElement||cs.activeElement||document.activeElement,index=items.indexOf(current);
      if(items.length){e.preventDefault();const next=items[(index+(e.shiftKey?-1:1)+items.length)%items.length];next.focus({preventScroll:true});if(next.getRootNode()!==document){const area=next.closest('[data-review-scroll]')||drawerBody,rect=next.getBoundingClientRect(),bounds=area.getBoundingClientRect();if(rect.bottom>bounds.bottom)area.scrollTop+=rect.bottom-bounds.bottom;else if(rect.top<bounds.top)area.scrollTop+=rect.top-bounds.top;}}
    }
  });
  $('history-open').onclick=()=>openDrawer('history');$('history-back').onclick=()=>openDrawer('rules');
  bq('words').onclick=()=>openDrawer('rules');bq('records').onclick=()=>openDrawer('history');bq('browse').onclick=()=>{openDrawer('rules');toggle.focus({preventScroll:true});};
  bq('reveal').onclick=()=>{$('reveal').click();};
  for(const field of ['enabled','abstract'])bq(field).onchange=async()=>{
    const next={...config,[field]:bq(field).checked};bq(field).disabled=true;
    try{await GM_setValue(STORE,next);config=next;bq('error').textContent='';scan();}
    catch{bq(field).checked=config[field];bq('error').textContent='保存失败，请重试';}finally{bq(field).disabled=false;}
  };
  let displayedWordSignature='';
  function updateFilterBar(total,hits){
    const signature=JSON.stringify(config.words);if(signature!==displayedWordSignature){displayedWordSignature=signature;const tags=config.words.map(word=>{const tag=document.createElement('span');tag.className='keyword-tag';tag.setAttribute('role','listitem');tag.textContent=word;return tag;});bq('keyword-tags').replaceChildren(...tags);}
    bq('enabled').checked=config.enabled;bq('abstract').checked=config.abstract;
    bq('words').title=config.words.join('、');const words='屏蔽词 '+config.words.length+' 个 · 编辑';if(bq('words').textContent!==words)bq('words').textContent=words;
    const summary='已加载 '+total+' 本 · '+(reveal?'命中':'隐藏')+' '+hits+' 本';if(bq('summary').textContent!==summary)bq('summary').textContent=summary;
    bq('reveal').textContent=reveal?'恢复隐藏':'临时显示隐藏书籍';
  }
  function mountFilterBar(){
    if(intro){if(!supportedPage()||!intro.card.isConnected||intro.card.getAttribute(MARK)==='hide')closeIntro(false);else positionIntro();}
    const anchor=document.querySelector('.muye-stack-book-list:not([data-fq-stream])')||document.querySelector('.rank-book-item')?.parentElement;
    filterBar.hidden=!supportedPage();if(anchor&&filterBar.nextElementSibling!==anchor)anchor.before(filterBar);
    if(!supportedPage()&&!detailBook()&&!/^\/bookshelf(?:\/|$)/.test(location.pathname)&&drawerTab)closeDrawer();
  }
  drawerReady=true;mountFilterBar();setInterval(mountFilterBar,700);

  scan();
  syncStream();
  renderChoices();
  // 覆盖网站内部跳转，包括书库与排行榜之间切换；无需改写网站 history。
  setInterval(() => {
    if (location.pathname + location.search !== lastPath) { lastPath = location.pathname + location.search; reveal = false; recordedSignatures.clear(); scan(); }
  }, 700);
})();

})().catch(error => console.error('[番茄关键词屏蔽] 初始化失败', error));
