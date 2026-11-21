let wordDraft=[];
const cloneProfile=value=>JSON.parse(JSON.stringify(value));
const newRuleId=()=>crypto.randomUUID?.()||'rule-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2);
let profileDraft=null,draftRevision=0,draftBaseline='',selectedGroup='',selectedWords=new Set(),profileBusy=false,pendingProfile='';
const currentProfile=()=>profileState.profiles.find(p=>p.id===profileState.activeId);
const currentGroup=()=>profileDraft.groups.find(g=>g.id===selectedGroup)||profileDraft.groups[0];
const manager=document.createElement('section');manager.id='profile-manager';
manager.innerHTML='<div class="profile-toolbar"><label>选书方案 <select id="profile-select" aria-label="当前选书方案"></select></label><label>名称 <input id="profile-name" maxlength="60" aria-label="方案名称"></label><button id="profile-delete">删除方案</button></div><details id="profile-create"><summary>新建或复制方案</summary><div class="profile-toolbar"><input id="profile-new-name" maxlength="60" placeholder="新方案名称，例如动漫衍生" aria-label="新方案名称"><button id="profile-copy">复制当前设置</button><button id="profile-empty">新建空白方案</button></div></details><p id="profile-message" role="status"></p><button id="profile-latest" hidden>放弃草稿，载入最新设置</button><div id="profile-confirm" hidden><span id="profile-confirm-text"></span><div class="row"><button id="profile-save-switch">保存并切换</button><button id="profile-discard-switch">放弃修改并切换</button><button id="profile-cancel">取消</button></div></div><div id="profile-delete-confirm" hidden><span>仅删除此选书方案，候选和屏蔽记录会保留。</span><button id="profile-delete-yes">确认删除</button><button id="profile-delete-no">取消</button></div>';
$('warning').after(manager);
const profileToggles=document.createElement('div');profileToggles.className='profile-toolbar profile-toggles';$('enabled').parentElement.before(profileToggles);profileToggles.append($('enabled').parentElement,$('abstract').parentElement);
const groupBar=document.createElement('section');groupBar.id='group-bar';
groupBar.innerHTML='<div class="profile-toolbar"><label>词组 <select id="group-select" aria-label="当前关键词分组"></select></label><label><input type="checkbox" id="group-enabled">启用此组</label><label>组名 <input id="group-name" maxlength="60" aria-label="分组名称"></label><button id="group-add">新建分组</button><button id="group-delete">删除空组</button></div><p>同组任意一个词命中即屏蔽。停用的词组仍会保留，保存后生效。</p>';
$('word-tags').before(groupBar);
const moveBar=document.createElement('div');moveBar.className='profile-toolbar';moveBar.id='word-move-bar';
moveBar.innerHTML='<span id="word-selected">勾选词标签可移动分组</span><select id="word-target" aria-label="移入哪个分组"></select><button id="word-move">移动勾选词</button>';
$('word-tags').after(moveBar);
$('save').parentElement.classList.add('rule-save-row');
const profileStyle=document.createElement('style');profileStyle.textContent='#profile-manager{padding:10px 12px;background:#fff9f4;border:1px solid #f0e1d6;border-radius:8px;margin:10px 0}.profile-toolbar{display:flex;align-items:center;gap:8px 12px;flex-wrap:wrap}.profile-toolbar label{display:flex;align-items:center;gap:6px;margin:0}.profile-toolbar input:not([type=checkbox]),.profile-toolbar select{font:inherit;max-width:240px;min-width:100px;padding:5px 8px;border:1px solid #ddd2c9;border-radius:6px;background:white;color:#4b4037}.profile-toolbar button{padding:5px 10px;font-size:13px}#profile-create{margin-top:8px}#profile-create summary{cursor:pointer;font-size:12px;color:#9d623f}#profile-create .profile-toolbar{margin-top:8px}#profile-message:empty{display:none}#profile-message{color:#a34222}#profile-confirm,#profile-delete-confirm{padding:8px;border-top:1px solid #e8dace;margin-top:8px}#group-bar{border-top:1px solid #eee2d8;padding:12px 0 4px}#group-name{width:160px}#word-move-bar{font-size:12px;margin:10px 0;color:#897363}#word-move-bar select{font-size:12px}#word-tags .word-tag input{margin:0;cursor:pointer}#profile-latest{margin-top:4px;font-size:12px}.profile-toggles{margin:12px 0}.profile-toolbar{font-size:13px}.rule-save-row{position:sticky;bottom:-20px;background:#fff;padding:10px 0;border-top:1px solid #eee3da;z-index:2}button:disabled{opacity:.45;cursor:default}#settings-view>label{margin:6px 0}#group-bar{padding-top:8px}#profile-manager{padding:8px 12px}';shadow.append(profileStyle);
function profileOptions(select,items,value){select.replaceChildren(...items.map(p=>{const o=document.createElement('option');o.value=p.id;o.textContent=p.name;return o;}));select.value=value;}
function captureProfileDraft(){
  if(!profileDraft)return;
  profileDraft.name=$('profile-name').value.trim();profileDraft.enabled=$('enabled').checked;profileDraft.abstract=$('abstract').checked;
  const group=currentGroup();group.name=$('group-name').value.trim();group.enabled=$('group-enabled').checked;group.words=wordDraft;
}
function profileDirty(){if(!drawerRulesLoaded||!profileDraft)return false;captureProfileDraft();return JSON.stringify(profileDraft)!==draftBaseline||!!$('words').value.trim();}
function renderGroupEditor(){
  const group=currentGroup();selectedGroup=group.id;wordDraft=group.words;selectedWords.clear();
  profileOptions($('group-select'),profileDraft.groups.map(g=>({...g,name:g.name+(g.enabled?'':'（已停用）')})),group.id);
  $('group-name').value=group.name;$('group-enabled').checked=group.enabled;
  profileOptions($('word-target'),profileDraft.groups.filter(g=>g.id!==group.id),profileDraft.groups.find(g=>g.id!==group.id)?.id||'');
  $('group-delete').disabled=profileDraft.groups.length<=1;$('word-move-bar').hidden=profileDraft.groups.length<2;
  renderWordTags();updateMoveSelection();updateSimpleRuleContext();
}
function updateMoveSelection(){$('word-selected').textContent=selectedWords.size?'已勾选 '+selectedWords.size+' 个词':'勾选词标签可移动分组';$('word-move').disabled=!selectedWords.size||profileDraft.groups.length<2;}
function resetProfileEditor(){
  const previousGroup=profileDraft?.id===profileState.activeId?selectedGroup:null;
  profileDraft=cloneProfile(currentProfile());draftRevision=profileState.revision;draftBaseline=JSON.stringify(profileDraft);selectedGroup=profileDraft.groups.some(g=>g.id===previousGroup)?previousGroup:profileDraft.groups[0].id;
  profileOptions($('profile-select'),profileState.profiles,profileState.activeId);$('profile-name').value=profileDraft.name;$('enabled').checked=profileDraft.enabled;$('abstract').checked=profileDraft.abstract;
  $('profile-delete').disabled=profileState.profiles.length<=1;$('profile-confirm').hidden=true;$('profile-delete-confirm').hidden=true;$('profile-latest').hidden=true;$('profile-message').textContent='';$('words').value='';
  renderGroupEditor();$('word-feedback').textContent='';
}
function applyProfileState(next){if(next.revision<profileState.revision)return;profileState=filterState(next);const changed=JSON.stringify(config.words)!==JSON.stringify(profileState.words);config={words:profileState.words,enabled:profileState.enabled,abstract:profileState.abstract};if(changed)matchFilterWords=compileFilterWords(config.words);}
async function persistProfiles(next,revision=profileState.revision){
  if(profileBusy)throw Error('正在保存，请稍后再试。');profileBusy=true;$('settings-view').inert=true;if(drawerReady)bq('bar').inert=true;
  try{
    const clean=filterState(next),result=await historyCall({action:'filterSave',state:clean,revision});
    if(result.conflict){applyProfileState(result.state);scan();$('profile-latest').hidden=false;throw Error('另一页已修改方案；草稿已保留，请载入最新设置后再编辑。');}
    applyProfileState(result.state);reveal=false;scan();renderChoices();return true;
  }finally{profileBusy=false;$('settings-view').inert=false;if(drawerReady)bq('bar').inert=false;}
}
function stateWithDraft(){captureProfileDraft();const next=cloneProfile(profileState);if(!next.profiles.some(p=>p.id===profileDraft.id))throw Error('此方案已被另一页删除，草稿仍在。');next.profiles=next.profiles.map(p=>p.id===profileDraft.id?cloneProfile(profileDraft):p);return next;}
async function saveProfileDraft(targetId){
  addWordInput();const next=stateWithDraft();if(targetId)next.activeId=targetId;
  await persistProfiles(next,draftRevision);resetWordDraft();$('profile-message').textContent=targetId?'已保存并切换方案。':'已保存当前方案。';
}
async function switchProfile(id,discard=false){
  if(!profileState.profiles.some(p=>p.id===id))return;
  if(id===profileState.activeId&&!discard)return;
  if(!discard&&profileDirty()){
    pendingProfile=id;openDrawer('rules');$('profile-select').value=profileState.activeId;$('profile-confirm').hidden=false;$('profile-confirm-text').textContent='当前方案有未保存修改。切换前请选择：';return;
  }
  try{const next=cloneProfile(profileState);next.activeId=id;await persistProfiles(next);if(drawerRulesLoaded)resetWordDraft();$('profile-message').textContent='已切换方案，当前书流已重新筛选。';}
  catch(error){$('profile-message').textContent='切换失败：'+error.message;if(drawerReady)bq('error').textContent='切换失败：'+error.message;}
  finally{$('profile-select').value=profileState.activeId;if(drawerReady)bq('profile-quick').value=profileState.activeId;}
}
$('profile-select').onchange=()=>switchProfile($('profile-select').value);
$('profile-save-switch').onclick=async()=>{try{await saveProfileDraft(pendingProfile);}catch(error){$('profile-message').textContent='保存失败：'+error.message;}};
$('profile-discard-switch').onclick=()=>switchProfile(pendingProfile,true);
$('profile-cancel').onclick=()=>{$('profile-confirm').hidden=true;pendingProfile='';};
$('profile-latest').onclick=()=>{resetWordDraft();};
async function createProfile(empty){
  const name=$('profile-new-name').value.trim();if(!name){$('profile-message').textContent='请先填写新方案名称。';return;}
  try{
    if(profileDirty()&&empty){$('profile-message').textContent='当前修改尚未保存，请先保存，或复制当前设置为新方案。';return;}
    addWordInput();captureProfileDraft();const p=empty?{id:newRuleId(),name,enabled:true,abstract:true,groups:[{id:newRuleId(),name:'未分组',enabled:true,words:[]}]}:{...cloneProfile(profileDraft),id:newRuleId(),name};
    const next=cloneProfile(profileState);next.profiles.push(p);next.activeId=p.id;await persistProfiles(next,draftRevision);resetWordDraft();$('profile-new-name').value='';$('profile-create').open=false;$('profile-message').textContent='已创建并启用“'+name+'”，原方案保持不变。';
  }catch(error){$('profile-message').textContent='创建失败：'+error.message;}
}
$('profile-copy').onclick=()=>createProfile(false);$('profile-empty').onclick=()=>createProfile(true);
$('profile-delete').onclick=()=>{$('profile-delete-confirm').hidden=false;};$('profile-delete-no').onclick=()=>{$('profile-delete-confirm').hidden=true;};
$('profile-delete-yes').onclick=async()=>{
  try{const next=cloneProfile(profileState);next.profiles=next.profiles.filter(p=>p.id!==profileDraft.id);next.activeId=next.profiles[0]?.id;await persistProfiles(next,draftRevision);resetWordDraft();$('profile-message').textContent='已删除方案，候选和屏蔽记录保持不变。';}
  catch(error){$('profile-message').textContent='删除失败：'+error.message;}
};
$('group-select').onchange=()=>{addWordInput();captureProfileDraft();selectedGroup=$('group-select').value;renderGroupEditor();};
$('group-add').onclick=()=>{addWordInput();captureProfileDraft();let n=1;while(profileDraft.groups.some(g=>g.name==='新分组 '+n))n++;const group={id:newRuleId(),name:'新分组 '+n,enabled:true,words:[]};profileDraft.groups.push(group);selectedGroup=group.id;renderGroupEditor();$('group-name').focus({preventScroll:true});$('group-name').select();};
$('group-delete').onclick=()=>{addWordInput();captureProfileDraft();if(currentGroup().words.length){$('word-feedback').textContent='请先把此组的词移动到其他分组，或逐词删除；只允许删除空组。';return;}if(profileDraft.groups.length<=1)return;profileDraft.groups=profileDraft.groups.filter(g=>g.id!==selectedGroup);selectedGroup=profileDraft.groups[0].id;renderGroupEditor();};
$('word-move').onclick=()=>{captureProfileDraft();const target=profileDraft.groups.find(g=>g.id===$('word-target').value);if(!target||target.id===selectedGroup)return;const seen=new Set(target.words.map(normalize));for(const word of wordDraft)if(selectedWords.has(word)&&!seen.has(normalize(word))){target.words.push(word);seen.add(normalize(word));}currentGroup().words=wordDraft.filter(w=>!selectedWords.has(w));renderGroupEditor();$('word-feedback').textContent='已移动到“'+target.name+'”，保存后生效。';};
