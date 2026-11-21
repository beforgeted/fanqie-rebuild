function parsedWordInput(){
  const seen=new Set();return $('words').value.split(/[\r\n,，、;；\t]+/).map(w=>w.trim()).filter(w=>{const key=normalize(w);if(!key||seen.has(key))return false;seen.add(key);return true;});
}
function pendingWords(){const existing=new Set(wordDraft.map(normalize));return parsedWordInput().filter(w=>!existing.has(normalize(w)));}
function previewWords(){const count=pendingWords().length;$('word-preview').textContent=$('words').value.trim()?(count?'可新增 '+count+' 个词':'没有新词，重复或无效内容会忽略'):'';}
function renderWordTags(){
  $('word-count').textContent='· '+wordDraft.length+' 个';
  const fragment=document.createDocumentFragment();
  wordDraft.forEach((word,index)=>{const tag=document.createElement('span');tag.className='word-tag';tag.setAttribute('role','listitem');const text=document.createElement('span');text.textContent=word;const check=document.createElement('input');check.type='checkbox';check.checked=selectedWords.has(word);check.setAttribute('aria-label','选择屏蔽词：'+word);check.onchange=()=>{if(check.checked)selectedWords.add(word);else selectedWords.delete(word);updateMoveSelection();};tag.append(check,text);const remove=document.createElement('button');remove.type='button';remove.textContent='×';remove.setAttribute('aria-label','删除屏蔽词：'+word);remove.onclick=()=>{selectedWords.delete(word);wordDraft.splice(index,1);renderWordTags();updateMoveSelection();$('word-feedback').textContent='已移除“'+word+'”，保存后生效。';const buttons=$('word-tags').querySelectorAll('button');(buttons[Math.min(index,buttons.length-1)]||$('words')).focus({preventScroll:true});};tag.append(remove);fragment.append(tag);});
  if(!wordDraft.length){const empty=document.createElement('span');empty.textContent='暂无屏蔽词';empty.className='empty-words';fragment.append(empty);}
  $('word-tags').replaceChildren(fragment);previewWords();
}
function resetWordDraft(){resetProfileEditor();}
function addWordInput(){const additions=pendingWords();wordDraft.push(...additions);$('words').value='';renderWordTags();$('word-feedback').textContent=additions.length?'已加入 '+additions.length+' 个词，保存后生效。':'没有新增词，重复或无效内容已忽略。';}
$('words').oninput=previewWords;
$('words').addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'&&!e.isComposing){e.preventDefault();addWordInput();}});
$('word-add').onclick=()=>{addWordInput();$('words').focus({preventScroll:true});};
