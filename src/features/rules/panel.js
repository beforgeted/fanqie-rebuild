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
    <h2>书库 / 排行榜屏蔽 · v1.11.0</h2>
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
