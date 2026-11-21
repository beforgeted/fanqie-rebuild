let historyQueue = Promise.resolve();
function historyCall(message) {
  if (typeof FQ_HISTORY === 'function') return FQ_HISTORY(message);
  const storage = {
    get: async key => GM_getValue(key, null),
    all: async () => {
      const keys = typeof GM_listValues === 'function' ? await GM_listValues() : [];
      const entries = await Promise.all(keys.filter(k=>k==='fq-keyword-filter-v1'||k==='fq-infinite-enabled'||k.startsWith('fq-history-book-')||k.startsWith('fq-choice-')||k.startsWith('fq-official-sync-')).map(async k=>[k,await GM_getValue(k,null)]));
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
