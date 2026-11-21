const backupView=document.createElement('section');backupView.id='backup-view';backupView.hidden=true;
backupView.innerHTML='<div class="backup-heading"><h3>把选书配置带到另一台电脑</h3><p>Chrome 和 Edge 通用。导出后，在另一台电脑拖入这个文件即可。</p></div><div class="backup-actions"><button id="backup-export">一键导出</button><span id="backup-export-status" role="status"></span></div><input id="backup-file" type="file" accept=".json,application/json" hidden><button id="backup-drop" type="button"><strong>拖入配置包，即可导入</strong><span>也可以点击选择 .json 文件</span></button><p class="backup-caption">已有数据自动合并，有冲突时再选择。不包含登录信息，也不会自动修改官方书架。</p><p id="backup-status" role="status"></p><section id="backup-conflicts" hidden><h4>这些内容不一致，请选择保留哪一份</h4><div class="backup-actions"><button id="backup-all-local">全部保留本机</button><button id="backup-all-file">全部采用备份</button></div><div id="backup-conflict-list" data-review-scroll></div><div class="backup-actions"><button id="backup-confirm">确认并导入</button><button id="backup-cancel">取消</button></div></section><button id="backup-retry" hidden>重试导入</button>';
$('panel').append(backupView);
const backupStyle=document.createElement('style');backupStyle.textContent='#backup-view{max-width:860px;margin:0 auto;padding:12px 0}#backup-view h3{font-size:21px;color:#332a24;margin:0 0 8px}#backup-view p{font-size:13px;color:#88786c}.backup-actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:16px 0}#backup-export,#backup-confirm{background:#ff651d;color:white;border-color:#ff651d}#backup-drop{width:100%;min-height:160px;border:1px dashed #d5b59d;background:#fffcf9;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;border-radius:10px}#backup-drop strong{font-size:18px;color:#65422b}#backup-drop span{font-size:13px;color:#978070}#backup-drop[data-over=true]{background:#fff1e5;border-color:#f76a24}#backup-status{color:#a34e25!important;white-space:pre-wrap}#backup-conflict-list{max-height:280px;overflow:auto;overscroll-behavior:contain}.backup-conflict-row{padding:12px 0;border-top:1px solid #eee1d6;display:grid;grid-template-columns:1fr auto;gap:6px 14px}.backup-conflict-row strong{overflow-wrap:anywhere}.backup-conflict-row p{grid-column:1/-1;white-space:pre-wrap;overflow-wrap:anywhere;margin:0!important}.backup-conflict-row select{font:inherit;padding:5px;border:1px solid #d9c5b5;border-radius:6px;background:white;max-width:150px}.backup-caption{margin:12px 0!important}#backup-entry{grid-column:1/-1;width:100%;font-size:13px}#backup-entry[data-new=true]{color:#c1551a;background:#fff5eb;border-color:#f3c5a7}#backup-onboarding{margin:0 0 14px;border:1px solid #efdbc9;border-radius:8px;padding:9px 12px;background:#fffaf5;font-size:13px;color:#926846;display:flex;align-items:center;justify-content:space-between;gap:12px}#backup-onboarding button{padding:4px 10px;font-size:13px}@media(max-width:600px){.backup-conflict-row{grid-template-columns:1fr}.backup-conflict-row p{grid-column:1}}';shadow.append(backupStyle);
const backupEntryStyle=document.createElement('style');backupEntryStyle.textContent='#backup-entry{grid-column:1/-1;width:100%;font-size:13px}#backup-entry[data-new=true]{color:#c1551a;background:#fff5eb;border-color:#f3c5a7}';bs.append(backupEntryStyle);
const backupEntry=document.createElement('button');backupEntry.id='backup-entry';backupEntry.textContent='备份与迁移';bq('bar').append(backupEntry);backupEntry.onclick=()=>openDrawer('backup');
const backupTab=document.createElement('button');backupTab.textContent='备份与迁移';backupTab.dataset.tab='backup';backupTab.setAttribute('role','tab');backupTab.onclick=()=>openDrawer('backup');drawer.querySelector('#fq-drawer-tabs').append(backupTab);
if(!GM_getValue(STORE,null)){const onboarding=document.createElement('div');onboarding.id='backup-onboarding';onboarding.append(document.createTextNode('已有其他电脑的配置？'));const button=document.createElement('button');button.textContent='导入已有配置';button.onclick=()=>openDrawer('backup');onboarding.append(button);$('settings-view').prepend(onboarding);backupEntry.dataset.new='true';backupEntry.textContent='导入已有配置 · 备份与迁移';}
let backupPack=null,backupDecisions={},backupBusy=false,backupGeneration=0;
const backupControls=['backup-drop','backup-file','backup-confirm','backup-cancel','backup-retry','backup-all-local','backup-all-file'];
function backupSetBusy(busy){backupBusy=busy;for(const id of backupControls)$(id).disabled=busy;}
const summarizeConflict=(value,kind)=>{
  if(kind==='setting')return value?'开启':'关闭';
  if(kind==='choice')return ({later:'候选',skip:'不想看',none:'未标记'}[value.state]||'未知')+'；备注：'+(value.note?value.note.slice(0,120)+(value.note.length>120?'…':''):'无');
  return value.name+' · '+value.groups.length+' 组 · '+value.groups.reduce((n,g)=>n+g.words.length,0)+' 词 · '+(value.enabled?'过滤开启':'过滤关闭')+' · '+(value.abstract?'匹配简介':'只匹配书名')+'\n'+value.groups.map(g=>g.name+(g.enabled?'':'（停用）')+'：'+g.words.join('、')).join('；').slice(0,220);
};
function renderBackupConflicts(rows){
  $('backup-conflicts').hidden=false;const fragment=document.createDocumentFragment();
  for(const item of rows){const row=document.createElement('div');row.className='backup-conflict-row';const title=document.createElement('strong');title.textContent=item.label;
    const select=document.createElement('select');select.setAttribute('aria-label','选择 '+item.label+' 的导入方式');
    for(const [value,label]of [['local','保留本机'],['file','采用备份'],...(item.kind==='profile'?[['both','两份都保留']]:[])]){const option=document.createElement('option');option.value=value;option.textContent=label;select.append(option);}
    backupDecisions[item.key]={signature:item.signature,choice:'local'};select.onchange=()=>{backupDecisions[item.key]={signature:item.signature,choice:select.value};};
    const description=document.createElement('p');description.textContent='本机：'+summarizeConflict(item.before,item.kind)+'\n备份：'+summarizeConflict(item.after,item.kind);row.append(title,select,description);fragment.append(row);
  }$('backup-conflict-list').replaceChildren(fragment);
}
async function importBackup(){
  if(!backupPack||backupBusy)return;
  backupSetBusy(true);$('backup-retry').hidden=true;$('backup-status').textContent='正在校验并合并…';
  try{
    const result=await historyCall({action:'backupImport',pack:backupPack,decisions:backupDecisions});
    if(result.needsChoice){renderBackupConflicts(result.conflicts);$('backup-status').textContent='发现 '+result.conflicts.length+' 项冲突，尚未写入任何数据。';return;}
    $('backup-conflicts').hidden=true;await refreshProfiles();await refreshChoices();if(historyView)await refreshHistory();
    applyInfinitePreference(result.infiniteEnabled);
    $('backup-status').textContent=(result.changed?'导入完成':Object.keys(backupDecisions).length?'合并完成，已保留所选内容':'配置已存在，无需重复导入')+'：'+result.counts.profiles+' 套方案、'+result.counts.choices+' 条个人标记、'+result.counts.history+' 条屏蔽记录。';
    $('backup-onboarding')?.remove();backupEntry.textContent='备份与迁移';delete backupEntry.dataset.new;backupPack=null;backupDecisions={};
  }catch(error){$('backup-status').textContent='未能完成导入：'+error.message+' 可重试，重复记录会自动去重。';$('backup-retry').hidden=false;}
  finally{backupSetBusy(false);}
}
async function readBackupFile(file){
  if(backupBusy)return;const generation=++backupGeneration;backupPack=null;backupDecisions={};$('backup-conflicts').hidden=true;$('backup-retry').hidden=true;
  try{
    if(!file||file.size>BACKUP_LIMIT)throw Error('请选择不超过 10 MB 的配置包。');
    const text=await file.text();if(generation!==backupGeneration)return;
    let parsed;try{parsed=JSON.parse(text.replace(/^\uFEFF/,''));}catch{throw Error('文件不是有效的 JSON 配置包。');}
    backupPack=backupClean(parsed);await importBackup();
  }catch(error){if(generation===backupGeneration)$('backup-status').textContent='无法导入：'+error.message;}
}
$('backup-drop').onclick=()=>$('backup-file').click();
$('backup-file').onchange=()=>{const file=$('backup-file').files[0];$('backup-file').value='';if(file)readBackupFile(file);};
$('backup-drop').ondragover=e=>{e.preventDefault();if(!backupBusy)$('backup-drop').dataset.over='true';};
$('backup-drop').ondragleave=()=>{delete $('backup-drop').dataset.over;};
$('backup-drop').ondrop=e=>{e.preventDefault();e.stopPropagation();delete $('backup-drop').dataset.over;if(backupBusy)return;const files=e.dataTransfer?.files;if(files?.length!==1){$('backup-status').textContent='请一次拖入一个配置包。';return;}readBackupFile(files[0]);};
for(const type of ['dragover','drop'])document.addEventListener(type,e=>{if(drawerTab==='backup'&&Array.from(e.dataTransfer?.types||[]).includes('Files'))e.preventDefault();});
$('backup-confirm').onclick=importBackup;$('backup-retry').onclick=importBackup;
$('backup-cancel').onclick=()=>{backupGeneration++;backupPack=null;backupDecisions={};$('backup-conflicts').hidden=true;$('backup-status').textContent='已取消，原有数据未改动。';};
for(const [id,value]of [['backup-all-local','local'],['backup-all-file','file']])$(id).onclick=()=>{for(const select of $('backup-conflict-list').querySelectorAll('select')){select.value=value;select.onchange();}};
$('backup-export').onclick=async()=>{
  $('backup-export').disabled=true;$('backup-export-status').textContent='正在打包…';
  try{const pack=await historyCall({action:'backupExport'}),blob=new Blob([JSON.stringify(pack,null,2)],{type:'application/json;charset=utf-8'});if(blob.size>BACKUP_LIMIT)throw Error('配置包超过 10 MB，请先减少记录数量。');
    const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='番茄选书配置-'+new Date().toISOString().slice(0,10)+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);$('backup-export-status').textContent='配置包已生成，请保留下载的文件。';
  }catch(error){$('backup-export-status').textContent='导出失败：'+error.message;}finally{$('backup-export').disabled=false;}
};
function applyInfinitePreference(value){if(typeof value!=='boolean'||value===infiniteEnabled)return;infiniteEnabled=value;toggle.checked=value;disposeStream();syncStream();scan();}
if(typeof FQ_PREF_WATCH==='function')FQ_PREF_WATCH(applyInfinitePreference);
