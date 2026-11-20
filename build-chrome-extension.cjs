const fs = require('node:fs');
const path = require('node:path');
const out = path.join(__dirname, 'chrome-extension');
fs.mkdirSync(out, {recursive:true});
const source = fs.readFileSync(path.join(__dirname,'fanqie-keyword-filter.user.js'),'utf8');
const manifest = {
  manifest_version:3,
  name:'番茄小说 · 二游关键词屏蔽',
  version:source.match(/@version\s+(\S+)/)[1],
  description:'在番茄书库和排行榜过滤指定题材，自动记录命中书籍，支持待处理清单与导出。',
  permissions:['storage'],
  background:{service_worker:'background.js'},
  content_scripts:[{
    matches:['https://fanqienovel.com/*','https://www.fanqienovel.com/*'],
    js:['content.js'], run_at:'document_idle', all_frames:false
  }]
};
const adapter = `// Local Chrome extension adapter. User-initiated shelf sync uses official same-origin APIs.
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
${source}
})().catch(error => console.error('[番茄关键词屏蔽] 初始化失败', error));
`;
fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
fs.writeFileSync(path.join(out,'content.js'),adapter);
const core = source.split('// HISTORY_CORE_BEGIN')[1].split('// HISTORY_CORE_END')[0].trim()+'\n';
fs.writeFileSync(path.join(out,'history-core.js'),'// GPL-3.0-only. Shared local history storage logic.\n'+core);
fs.copyFileSync(path.join(__dirname,'history-background.js'),path.join(out,'background.js'));
fs.copyFileSync(path.join(__dirname,'LICENSE.txt'),path.join(out,'LICENSE.txt'));
console.log('Built extension:',out);

fs.copyFileSync(path.join(__dirname,'第三方来源与许可.md'),path.join(out,'第三方来源与许可.md'));
