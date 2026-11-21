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

export { filterNormalize, profileWords, filterState, compileFilterWords };
