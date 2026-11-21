const cache = await chrome.storage.local.get(['fq-keyword-filter-v1','fq-infinite-enabled']);
function GM_getValue(key, fallback) { return Object.hasOwn(cache, key) ? cache[key] : fallback; }
async function GM_setValue(key, value) { await chrome.storage.local.set({[key]:value}); cache[key] = value; }
function FQ_CHOICE_WATCH(fn) { chrome.storage.onChanged?.addListener((changes,area)=>{if(area==='local'&&Object.keys(changes).some(k=>k.startsWith('fq-choice-')||k.startsWith('fq-official-sync-')))fn();}); }
function FQ_CONFIG_WATCH(fn) { chrome.storage.onChanged?.addListener((changes,area)=>{if(area==='local'&&changes['fq-keyword-filter-v1']){cache['fq-keyword-filter-v1']=changes['fq-keyword-filter-v1'].newValue;fn();}}); }
function FQ_PREF_WATCH(fn) { chrome.storage.onChanged?.addListener((changes,area)=>{if(area==='local'&&changes['fq-infinite-enabled']){cache['fq-infinite-enabled']=changes['fq-infinite-enabled'].newValue;fn(changes['fq-infinite-enabled'].newValue);}}); }
function GM_registerMenuCommand() {} // The integrated page drawer provides settings.
async function FQ_HISTORY(message) {
  const response = await chrome.runtime.sendMessage({channel:'fq-filter-history',...message});
  if (!response?.ok) throw new Error(response?.error || '记录操作失败');
  return response.result;
}
