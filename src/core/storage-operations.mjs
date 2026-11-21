import { filterState } from './filters.mjs';
import { backupOperation } from './backup.mjs';

// Shared with the extension service worker. Each book has its own key; writes
// are serialized by the caller so records/handled marks survive tab races.
async function historyOperation(storage, message) {
  if(message.action==='backupExport'||message.action==='backupImport')return backupOperation(storage,message);
  if(message.action==='filterRead'||message.action==='filterSave'){
    const key='fq-keyword-filter-v1',state=filterState(await storage.get(key));
    if(message.action==='filterRead')return state;
    if(message.revision!==state.revision)return {conflict:true,state};
    if(message.state?.schema!==2)throw Error('无效的筛选设置');
    const next=filterState(message.state);next.revision=state.revision+1;
    await storage.set({[key]:next});return {state:next};
  }
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

export { historyOperation };
