import { filterState } from './filters.mjs';

const BACKUP_FORMAT='fanqie-rebuild-backup',BACKUP_LIMIT=10*1024*1024;
function backupClean(raw){
  if(!raw||raw.format!==BACKUP_FORMAT||raw.version!==1)throw Error('不是支持的番茄配置包，或版本过新。');
  if(JSON.stringify(raw).length>BACKUP_LIMIT)throw Error('配置包超过 10 MB。');
  const data=raw.data;if(!data||data.settings?.schema!==2||typeof data.infiniteEnabled!=='boolean')throw Error('配置包缺少有效设置。');
  const settings=filterState(data.settings);
  const list=(rows,label,clean)=>{if(!Array.isArray(rows)||rows.length>50000)throw Error(label+'格式错误或数量过多。');const ids=new Set();return rows.map(row=>{if(!row||typeof row.id!=='string'||!/^\d{5,25}$/.test(row.id)||ids.has(row.id))throw Error(label+'含无效或重复书籍 ID。');ids.add(row.id);return clean(row);});};
  const str=(value,max,required=false)=>{if(value===undefined&&!required)return '';if(typeof value!=='string'||value.length>max||(required&&!value.trim()))throw Error('配置包包含无效文字字段。');return value;};
  const time=value=>{if(value===undefined)return 0;if(!Number.isSafeInteger(value)||value<0||value>8640000000000000)throw Error('配置包包含无效时间。');return value;};
  const choices=list(data.choices,'个人标记',row=>{
    if(!['none','later','skip'].includes(row.state))throw Error('配置包包含未知选书状态。');
    const cover=str(row.cover,3000);if(cover){const u=new URL(cover);if(u.protocol!=='https:'||u.username||u.password)throw Error('封面链接无效。');}
    return {id:row.id,title:str(row.title,500,true),author:str(row.author,200),abstract:str(row.abstract,12000),meta:str(row.meta,500),cover,state:row.state,note:str(row.note,2000),updatedAt:time(row.updatedAt),noteUpdatedAt:time(row.noteUpdatedAt)};
  });
  const history=list(data.history,'屏蔽记录',row=>{
    if(!Array.isArray(row.matches)||row.matches.length>10000)throw Error('屏蔽记录的命中词无效。');
    return {id:row.id,title:str(row.title,500,true),author:str(row.author,200),url:'https://fanqienovel.com/page/'+row.id,matches:[...new Set(row.matches.map(w=>str(w,200,true)))],firstSeen:time(row.firstSeen),lastSeen:time(row.lastSeen),handledAt:time(row.handledAt)};
  });
  return {format:BACKUP_FORMAT,version:1,exportedAt:typeof raw.exportedAt==='string'?raw.exportedAt:'',data:{settings:{schema:2,activeId:settings.activeId,profiles:settings.profiles},infiniteEnabled:data.infiniteEnabled,choices,history}};
}
function backupFromStorage(all){
  const settings=filterState(all['fq-keyword-filter-v1']);
  return backupClean({format:BACKUP_FORMAT,version:1,exportedAt:new Date().toISOString(),data:{settings,infiniteEnabled:all['fq-infinite-enabled']!==false,
    choices:Object.entries(all).filter(([k,v])=>k.startsWith('fq-choice-')&&v&&k==='fq-choice-'+v.id).map(([,v])=>v),
    history:Object.entries(all).filter(([k,v])=>k.startsWith('fq-history-book-')&&v&&k==='fq-history-book-'+v.id).map(([,v])=>v)}});
}
function backupPlan(all,raw,decisions={}){
  const pack=backupClean(raw),incoming=pack.data,patch={},conflicts=[];
  const local=filterState(all['fq-keyword-filter-v1']),profiles=JSON.parse(JSON.stringify(local.profiles)),fresh=!all['fq-keyword-filter-v1'];
  if(fresh)profiles.length=0;
  const profileShape=p=>JSON.stringify({name:p.name,enabled:p.enabled,abstract:p.abstract,groups:p.groups.map(g=>({name:g.name,enabled:g.enabled,words:g.words}))});
  const conflict=(key,label,kind,before,after)=>{
    const signature=JSON.stringify([before,after]),decision=Object.hasOwn(decisions,key)?decisions[key]:null;
    if(decision?.signature===signature&&['local','file',...(kind==='profile'?['both']:[])].includes(decision.choice))return decision.choice;
    conflicts.push({key,label,kind,before,after,signature});return 'local';
  };
  const uniqueName=(name,skip)=>{let candidate=name,n=1;while(profiles.some(p=>p.id!==skip&&p.name===candidate))candidate=name.slice(0,45)+'（导入 '+n+++'）';return candidate;};
  const uniqueId=id=>{let next=id,n=1;while(profiles.some(p=>p.id===next))next=id.slice(0,75)+'-import-'+n++;return next;};
  const importedIds=new Map();
  for(const source of incoming.settings.profiles){
    const importedCopy=profiles.find(p=>p.name.startsWith(source.name.slice(0,45)+'（导入 ')&&profileShape({...p,name:source.name})===profileShape(source));
    if(importedCopy){importedIds.set(source.id,importedCopy.id);continue;}
    const original=profiles.find(p=>p.id===source.id)||profiles.find(p=>p.name===source.name);
    let choice='file';if(original&&profileShape(original)!==profileShape(source))choice=conflict('profile:'+original.id,source.name,'profile',original,source);
    if(original&&choice==='local'){importedIds.set(source.id,original.id);continue;}
    if(original&&profileShape(original)===profileShape(source)){importedIds.set(source.id,original.id);continue;}
    const p=JSON.parse(JSON.stringify(source));
    if(original&&choice!=='both'){p.id=original.id;p.name=uniqueName(p.name,original.id);profiles[profiles.indexOf(original)]=p;}
    else{p.id=uniqueId(p.id);p.name=uniqueName(p.name);profiles.push(p);}
    importedIds.set(source.id,p.id);
  }
  const nextSettings=filterState({schema:2,revision:local.revision+1,activeId:fresh?importedIds.get(incoming.settings.activeId):local.activeId,profiles});
  if(fresh||JSON.stringify(local.profiles)!==JSON.stringify(nextSettings.profiles))patch['fq-keyword-filter-v1']=nextSettings;
  const localInfinite=all['fq-infinite-enabled'];let infiniteChoice='file';
  if(typeof localInfinite==='boolean'&&localInfinite!==incoming.infiniteEnabled)infiniteChoice=conflict('infinite','无限滚动开关','setting',localInfinite,incoming.infiniteEnabled);
  if(infiniteChoice==='file'&&localInfinite!==incoming.infiniteEnabled)patch['fq-infinite-enabled']=incoming.infiniteEnabled;
  for(const row of incoming.choices){
    const key='fq-choice-'+row.id,old=all[key];let decision='file';
    if(old&&(old.state!==row.state||(old.note||'')!==row.note))decision=conflict('choice:'+row.id,row.title,'choice',{state:old.state,note:old.note||''},{state:row.state,note:row.note});
    if(decision==='local')continue;
    const note=row.note;const next={...old,...row,note,noteRevision:old?.noteRevision||0};
    if(!old||note!==(old.note||'')){next.noteRevision++;next.noteUpdatedAt=Date.now();}else next.noteUpdatedAt=old.noteUpdatedAt||0;
    if(old){for(const field of ['cover','author','abstract','meta'])if(!next[field])next[field]=old[field]||'';next.updatedAt=old.state===row.state?old.updatedAt:Date.now();}
    if(!old||['title','author','abstract','meta','cover','state','note'].some(f=>(old[f]||'')!==(next[f]||'')))patch[key]=next;
  }
  for(const row of incoming.history){
    const key='fq-history-book-'+row.id,old=all[key];
    const next=old?{...old,title:old.title||row.title,author:old.author||row.author,url:row.url,matches:[...new Set([...(old.matches||[]),...row.matches])],firstSeen:Math.min(old.firstSeen||row.firstSeen,row.firstSeen||old.firstSeen),lastSeen:Math.max(old.lastSeen||0,row.lastSeen),handledAt:Math.max(old.handledAt||0,row.handledAt)}:row;
    if(JSON.stringify(old)!==JSON.stringify(next))patch[key]=next;
  }
  return {patch,conflicts,counts:{profiles:incoming.settings.profiles.length,choices:incoming.choices.length,history:incoming.history.length},changed:Object.keys(patch).length};
}
async function backupOperation(storage,message){
  const all=await storage.all();
  if(message.action==='backupExport')return backupFromStorage(all);
  if(!storage.atomicBackup)throw Error('导入目前支持 Chrome／Edge 扩展版，请使用扩展安装包。');
  const plan=backupPlan(all,message.pack,message.decisions||{});
  if(plan.conflicts.length)return {needsChoice:true,conflicts:plan.conflicts,counts:plan.counts};
  if(plan.changed)await storage.set(plan.patch);
  return {ok:true,counts:plan.counts,changed:plan.changed,infiniteEnabled:plan.patch['fq-infinite-enabled']??(all['fq-infinite-enabled']!==false)};
}

export { BACKUP_FORMAT, BACKUP_LIMIT, backupClean, backupFromStorage, backupPlan, backupOperation };
