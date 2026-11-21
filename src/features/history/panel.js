function showHistory(show) {
  historyView = show;if($('backup-view'))$('backup-view').hidden=true;
  $('settings-view').hidden = show;
  $('history-view').hidden = !show;
  $('panel').dataset.view = show ? 'history' : 'settings';
  if (show) refreshHistory();
}
function renderHistory() {
  const pending = historyRows.filter(row=>!row.handledAt).length;
  $('history-summary').textContent = `共 ${historyRows.length} 本 · 待处理 ${pending} 本 · 我已处理 ${historyRows.length-pending} 本`;
  const query = normalize($('history-search').value), mode = $('history-filter').value;
  const rows = historyRows.filter(row => (mode === 'all' || (mode === 'handled' ? !!row.handledAt : !row.handledAt)) &&
    (!query || normalize([row.title,row.author,...(row.matches||[])].join(' ')).includes(query)));
  const fragment = document.createDocumentFragment();
  for (const row of rows) {
    const li = document.createElement('li');
    li.dataset.bookId = row.id;
    const link = document.createElement('a');
    link.href = 'https://fanqienovel.com/page/' + row.id;
    link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = row.title;
    li.append(link);
    const meta = document.createElement('div'); meta.className = 'meta';
    const date = value => new Date(value).toLocaleString('zh-CN',{hour12:false});
    meta.textContent = `${row.author ? '作者：'+row.author+' · ' : ''}命中：${(row.matches||[]).join('、')}\n首次：${date(row.firstSeen)} · 最近：${date(row.lastSeen)}${row.handledAt ? ' · 已手动标记处理' : ''}`;
    meta.style.whiteSpace = 'pre-line'; li.append(meta);
    const actions = document.createElement('div'); actions.className = 'history-actions';
    const copy = document.createElement('button'); copy.textContent = '复制书名';
    copy.onclick = () => copyText(row.title);
    const mark = document.createElement('button'); mark.textContent = row.handledAt ? '恢复待处理' : '标记我已处理';
    mark.title = '只记录你的处理进度，不向番茄提交操作';
    mark.onclick = async () => {
      mark.disabled = true;
      try { await historyCall({action:'mark',id:row.id,handled:!row.handledAt}); await refreshHistory(); }
      catch { $('history-message').textContent = '处理标记保存失败，请重试。'; mark.disabled = false; }
    };
    actions.append(copy,mark); li.append(actions); fragment.append(li);
  }
  if (!rows.length) {
    const li = document.createElement('li'); li.textContent = historyRows.length ? '没有符合条件的记录。' : '还没有记录。浏览书库或排行榜后，命中的书会自动保存在这里。'; fragment.append(li);
  }
  $('history-list').replaceChildren(fragment);
}
async function refreshHistory() {
  const requestId = ++historyRefreshId;
  try {
    const rows = await historyCall({action:'list'});
    if (requestId !== historyRefreshId) return;
    historyRows = rows; renderHistory();
    $('history-message').textContent = historyError;
  } catch { if (requestId === historyRefreshId) $('history-message').textContent = '读取记录失败，请点击刷新记录重试。'; }
}
async function copyText(text) {
  if (!text) { $('history-message').textContent = '没有待复制的书籍。'; return; }
  $('copy-fallback').hidden = true;
  try { await navigator.clipboard.writeText(text); $('history-message').textContent = '已复制，可在手机 App 中查找并操作。'; }
  catch {
    $('copy-text').value = text; $('copy-fallback').hidden = false;
    $('copy-text').focus(); $('copy-text').select();
  }
}
$('history-open').onclick = () => showHistory(true);
$('history-back').onclick = () => showHistory(false);
$('history-close').onclick = closePanel;
$('history-search').oninput = renderHistory;
$('history-filter').onchange = renderHistory;
$('history-refresh').onclick = refreshHistory;
$('history-copy').onclick = () => copyText(historyRows.filter(row=>!row.handledAt).map(row=>`${row.title}\nhttps://fanqienovel.com/page/${row.id}`).join('\n\n'));
$('history-export').onclick = () => {
  if (!historyRows.length) { $('history-message').textContent = '暂无记录可导出。'; return; }
  // Prevent spreadsheet formulas in book titles/authors from executing on open.
  const cell = value => { let s=String(value??''); if (/^[\s]*[=+@-]/.test(s)) s="'"+s; return '"'+s.replace(/"/g,'""')+'"'; };
  const rows = [['书名','作者','书籍ID','书籍链接','命中词','首次记录','最近记录','处理状态'],
    ...historyRows.map(row=>[row.title,row.author,row.id,'https://fanqienovel.com/page/'+row.id,(row.matches||[]).join('、'),new Date(row.firstSeen).toISOString(),new Date(row.lastSeen).toISOString(),row.handledAt?'我已处理（手动标记）':'待处理'])];
  const blob = new Blob(['\ufeff'+rows.map(row=>row.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});
  const url = URL.createObjectURL(blob), link = document.createElement('a');
  link.href = url; link.download = '番茄屏蔽记录-'+new Date().toISOString().slice(0,10)+'.csv';
  link.click(); setTimeout(()=>URL.revokeObjectURL(url),30000);
};
function rememberCards(records) {
  const fresh = records.filter(row=>recordedSignatures.get(row.id)!==JSON.stringify(row));
  if (!fresh.length) return;
  for (const row of fresh) recordedSignatures.set(row.id,JSON.stringify(row));
  historyCall({action:'record',records:fresh}).then(()=>{
    historyError = ''; $('history-save-warning').textContent = '';
    if (historyView) refreshHistory();
  }).catch(()=>{
    for (const row of fresh) recordedSignatures.delete(row.id);
    historyError = '屏蔽仍生效，但记录保存失败；请检查扩展存储后刷新页面。';
    $('history-save-warning').textContent = historyError;
    if (historyView) $('history-message').textContent = historyError;
  });
}
function openPanel() {
  if(drawerReady){openDrawer('rules');return;}
  resetWordDraft();
  $('enabled').checked = config.enabled;
  $('abstract').checked = config.abstract;
  $('panel').hidden = false;
  $('open').setAttribute('aria-expanded', 'true');
  if (historyView) refreshHistory();
}
function closePanel() {
  if(drawerReady){closeDrawer();return;}
  $('panel').hidden = true;
  $('open').setAttribute('aria-expanded', 'false');
}
$('open').onclick = () => $('panel').hidden ? openPanel() : closePanel();
$('close').onclick = closePanel;
$('panel').addEventListener('keydown', e => { if (e.key === 'Escape') closePanel(); });
$('save').onclick = async () => {
  try{await saveProfileDraft();$('word-feedback').textContent='已保存并应用 '+config.words.length+' 个生效屏蔽词。';}
  catch(error){$('word-feedback').textContent='保存失败，请重试；词表草稿已保留。'+error.message;}
};
$('reset').onclick = () => {wordDraft=DEFAULT_WORDS.slice();currentGroup().words=wordDraft;selectedWords.clear();$('words').value='';renderWordTags();updateMoveSelection();$('word-feedback').textContent='已在当前组填入默认词表，保存后生效；其他组不变。';};
$('reveal').onclick = () => { reveal = !reveal; scan(); };
GM_registerMenuCommand('番茄小说：编辑屏蔽词', () => { if (supportedPage()) openPanel(); else alert('请在番茄小说的「书库」或「排行榜」页面设置屏蔽词。'); });
