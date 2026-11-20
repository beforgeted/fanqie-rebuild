// GPL-3.0-only. Shared local history storage logic.
// Shared with the extension service worker. Each book has its own key; writes
  // are serialized by the caller so records/handled marks survive tab races.
  async function historyOperation(storage, message) {
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
  function filterNormalize(text){return text.normalize('NFKC').toLowerCase().replace(/[\s\p{P}\u200b-\u200d\ufeff]/gu,'');}
  function profileWords(profile){
    const seen=new Set();return profile.groups.filter(g=>g.enabled).flatMap(g=>g.words).filter(word=>{const key=filterNormalize(word);if(!key||seen.has(key))return false;seen.add(key);return true;});
  }
  function filterState(raw){
    if(raw?.schema===2){
      if(!Array.isArray(raw.profiles)||!raw.profiles.length||raw.profiles.length>30)throw Error('无效方案');
      const ids=new Set(),names=new Set();
      const profiles=raw.profiles.map(p=>{
        if(typeof p.id!=='string'||!p.id||ids.has(p.id)||p.id.length>100||typeof p.name!=='string'||!p.name.trim()||p.name.length>60||names.has(p.name.trim()))throw Error('方案名称或标识重复');
        ids.add(p.id);names.add(p.name.trim());
        if(!Array.isArray(p.groups)||!p.groups.length||p.groups.length>100)throw Error('无效分组');
        const gids=new Set(),gnames=new Set();let count=0;
        const groups=p.groups.map(g=>{
          if(typeof g.id!=='string'||!g.id||gids.has(g.id)||g.id.length>100||typeof g.name!=='string'||!g.name.trim()||g.name.length>60||gnames.has(g.name.trim())||!Array.isArray(g.words))throw Error('分组名称或标识重复');
          gids.add(g.id);gnames.add(g.name.trim());count+=g.words.length;
          if(count>10000||g.words.some(w=>typeof w!=='string'||w.length>200||!filterNormalize(w)))throw Error('屏蔽词无效或过多');
          return {id:g.id,name:g.name.trim(),enabled:g.enabled!==false,words:g.words.slice()};
        });
        return {id:p.id,name:p.name.trim(),enabled:p.enabled!==false,abstract:p.abstract!==false,groups};
      });
      const active=profiles.find(p=>p.id===raw.activeId);if(!active)throw Error('当前方案不存在');
      return {schema:2,revision:Number.isSafeInteger(raw.revision)&&raw.revision>=0?raw.revision:0,activeId:active.id,profiles,words:profileWords(active),enabled:active.enabled,abstract:active.abstract};
    }
    const words=Array.isArray(raw?.words)?raw.words.filter(w=>typeof w==='string'&&filterNormalize(w)):['原神','崩铁','星穹铁道','星铁','崩坏3','崩坏三','绝区零','鸣潮'];
    const profile={id:'default',name:'默认方案',enabled:raw?.enabled!==false,abstract:raw?.abstract!==false,groups:[{id:'original',name:'原有词表',enabled:true,words}]};
    return {schema:2,revision:0,activeId:profile.id,profiles:[profile],words:profileWords(profile),enabled:profile.enabled,abstract:profile.abstract};
  }
  function compileFilterWords(words){const entries=words.map(word=>({word,key:filterNormalize(word)})).filter(e=>e.key);return fields=>{const texts=fields.map(filterNormalize);return entries.filter(e=>texts.some(text=>text.includes(e.key))).map(e=>e.word);};}
