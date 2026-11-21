// Put the everyday task first; reuse existing controls and their draft handlers.
const profileManage=document.createElement('details');profileManage.id='profile-manage';
profileManage.innerHTML='<summary>管理方案</summary><div class="profile-toolbar"></div>';
const profileToolbar=manager.querySelector('.profile-toolbar'),profileSelectLabel=$('profile-select').parentElement;
profileSelectLabel.firstChild.textContent='当前方案 ';
profileManage.querySelector('div').append($('profile-name').parentElement,$('profile-delete'));
profileManage.append($('profile-create'));profileToolbar.append(profileManage);
const groupContext=document.createElement('div');groupContext.id='rule-group-context';groupContext.className='profile-toolbar';
const groupSelectLabel=$('group-select').parentElement;groupSelectLabel.firstChild.textContent='当前分组 ';
groupContext.append(groupSelectLabel,$('group-enabled').parentElement);
const organize=document.createElement('details');organize.id='group-organize';
organize.innerHTML='<summary>整理分组</summary>';
organize.append(groupBar,moveBar);
organize.addEventListener('toggle',()=>{$('settings-view').dataset.organizing=String(organize.open);updateSimpleRuleContext();});
groupBar.querySelector('p').textContent='把同类词放在一组，之后可以整组开关。勾选词标签可移动分组。';
const inputBlock=document.createElement('section');inputBlock.id='rule-input-block';
const inputLabel=shadow.querySelector('label[for="words"]');inputLabel.textContent='不想看到哪些内容？';
$('words').placeholder='例如：原神，崩铁，鸣潮';$('words').setAttribute('aria-label','输入不想看的作品、角色或题材关键词');
$('word-help').textContent='填作品名、角色名或题材词，多个词用逗号或换行隔开。';
inputBlock.append(inputLabel,$('word-help'),groupContext,$('words'),$('word-preview'));
const tagsBlock=document.createElement('section');tagsBlock.id='rule-tags-block';
const tagsLabel=$('word-count').parentElement;tagsLabel.firstChild.textContent='已添加 ';
tagsBlock.append(tagsLabel,$('word-tags'));
const more=document.createElement('details');more.id='rule-more';more.innerHTML='<summary>更多设置与说明</summary>';
toggle.id='infinite-toggle';more.append(toggleLabel,$('status'));
const saveRow=$('save').parentElement;saveRow.id='rule-save-row';
$('word-add').hidden=true;$('enabled').parentElement.lastChild.textContent=' 启用过滤';$('abstract').parentElement.lastChild.textContent=' 匹配简介';
$('abstract').title='同时匹配书名和简介；取消后只匹配书名';
saveRow.prepend(profileToggles);saveRow.append($('word-feedback'));
// The remaining explanatory paragraphs and less-used actions stay available below.
const settings=$('settings-view');
for(const node of [...settings.children])if(![manager,inputBlock,tagsBlock,organize,more,saveRow,$('warning'),$('history-save-warning')].includes(node))more.append(node);
settings.replaceChildren(manager,inputBlock,tagsBlock,organize,more,$('warning'),$('history-save-warning'),saveRow);
const simpleStyle=document.createElement('style');simpleStyle.textContent=`
  #settings-view{max-width:920px;margin:0 auto}#profile-manager{padding:0 0 14px;border:0;border-bottom:1px solid #eee5de;border-radius:0;background:white;margin:0 0 20px}
  #profile-manager>.profile-toolbar{justify-content:space-between;align-items:start}#profile-select{min-width:160px}
  #profile-manage{flex:1;text-align:right}#profile-manage>summary{display:list-item;list-style-position:inside}#profile-manage[open]{flex-basis:100%;text-align:left;background:#faf7f4;padding:12px;border-radius:8px}#profile-manage>.profile-toolbar{margin-top:10px}
  #profile-create{margin-top:10px}#settings-view summary{cursor:pointer;font-size:13px;color:#89705d;line-height:24px;width:fit-content}#profile-manage:not([open])>summary{margin-left:auto}
  #rule-input-block>label{display:block;font-size:20px;line-height:1.4;font-weight:600;margin:0;color:#332a24}#rule-input-block #word-help{margin:7px 0 12px;color:#8a7b70;font-size:13px}
  #rule-input-block #words{height:72px;min-height:60px;max-height:160px;padding:12px 14px;resize:vertical;font-size:15px;background:#fffdfb;border:1px solid #d9c8b9;border-radius:8px;display:block;scroll-margin-bottom:95px}
  #words:focus{outline:2px solid #f08b54;outline-offset:1px}#rule-group-context{margin:0 0 10px}#rule-input-block #word-preview{display:block;margin-top:5px;min-height:0;color:#a35c2f}
  #rule-tags-block{margin:20px 0 14px}#rule-tags-block>label{margin:0 0 8px;font-size:12px;color:#8b7d71}#rule-tags-block #word-tags{max-height:150px;padding:2px;gap:8px}#rule-tags-block .word-tag{font-size:13px;padding:3px 9px;gap:7px}
  #settings-view:not([data-organizing=true]) .word-tag input{display:none}#group-organize,#rule-more{border-top:1px solid #f0e8e1;padding:10px 0}#group-bar{border:0;padding:10px 0 0}#word-move-bar{margin-bottom:4px}#rule-more>label{font-size:13px}#rule-more p{max-width:750px}
  #rule-save-row{display:flex;align-items:center;gap:12px;margin:8px 0 0;padding:12px 0;bottom:-20px;border-top:1px solid #e9dfd7;background:white;box-shadow:0 -8px 12px #ffffffeb;flex-wrap:wrap}
  #rule-save-row .profile-toggles{margin:0;gap:18px;flex:1}#rule-save-row #save{margin-left:auto;min-width:128px;padding:8px 18px}#rule-save-row #word-feedback{flex-basis:100%;margin:0;font-size:12px;color:#a15d38}#word-feedback:empty,#profile-message:empty,#warning:empty,#history-save-warning:empty{display:none}
  @media(max-width:760px){#rule-input-block>label{font-size:18px}#settings-view #profile-select{min-width:100px;max-width:200px}#rule-save-row .profile-toggles{gap:8px}#rule-save-row #save{min-width:100px;padding:7px 10px}}
`;shadow.append(simpleStyle);
function updateSimpleRuleContext(){
  if(!profileDraft)return;
  groupContext.hidden=profileDraft.groups.length===1&&currentGroup().enabled&&!organize.open;
  $('words').placeholder=profileDraft.groups.length>1?'添加到「'+currentGroup().name+'」，例如：原神，崩铁，鸣潮':'例如：原神，崩铁，鸣潮';
}
