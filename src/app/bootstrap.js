drawerReady=true;mountFilterBar();setInterval(mountFilterBar,700);

let configReadSerial=0;
async function refreshProfiles(){
  const serial=++configReadSerial;
  try{const next=await historyCall({action:'filterRead'});if(serial!==configReadSerial||next.revision<=profileState.revision)return;
    const dirty=profileDirty();applyProfileState(next);scan();renderChoices();
    if(drawerRulesLoaded){if(dirty){$('profile-message').textContent='另一页更新了方案；正在使用「'+currentProfile().name+'」，本页草稿保留，保存前请载入最新设置。';$('profile-latest').hidden=false;}else resetWordDraft();}
  }catch{if(drawerRulesLoaded)$('profile-message').textContent='读取方案失败，请稍后重试。';}
}
if(typeof FQ_CONFIG_WATCH==='function')FQ_CONFIG_WATCH(refreshProfiles);
window.addEventListener('focus',refreshProfiles);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshProfiles();});
if(typeof FQ_CONFIG_WATCH!=='function')setInterval(refreshProfiles,2000);
scan();
syncStream();
renderChoices();
refreshProfiles();
// 覆盖网站内部跳转，包括书库与排行榜之间切换；无需改写网站 history。
setInterval(() => {
  if (location.pathname + location.search !== lastPath) { lastPath = location.pathname + location.search; reveal = false; recordedSignatures.clear(); scan(); }
}, 700);
