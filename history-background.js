// GPL-3.0-only. Serialize history updates across tabs; no network access.
importScripts('history-core.js');
const historyStorage = {
  all: () => chrome.storage.local.get(null),
  get: async key => (await chrome.storage.local.get(key))[key],
  set: values => chrome.storage.local.set(values)
};
let pending = Promise.resolve();
chrome.runtime.onMessage.addListener((message,sender,sendResponse) => {
  if (message?.channel !== 'fq-filter-history') return false;
  let authorized = false;
  try {
    const url = new URL(sender.url);
    authorized = sender.id === chrome.runtime.id && url.protocol === 'https:' &&
      ['fanqienovel.com','www.fanqienovel.com'].includes(url.hostname);
  } catch {}
  if (!authorized) { sendResponse({ok:false,error:'不支持的页面'}); return false; }
  const job = pending.then(()=>historyOperation(historyStorage,message));
  pending = job.catch(()=>{});
  job.then(result=>sendResponse({ok:true,result}),()=>sendResponse({ok:false,error:'本地记录存储失败'}));
  return true;
});
