// Cache decoded metadata, while retaining each book object used by existing button handlers.
const libraryBookCache=new WeakMap(),libraryGapCache=new WeakMap();let libraryTextEpoch=0,libraryLayoutEpoch=0;
function invalidateLibraryCards(records){
  for(const record of records){
    const target=record.target.nodeType===1?record.target:record.target.parentElement;
    const card=target?.closest?.(CARD);
    if(card){const cached=libraryBookCache.get(card);if(cached)cached.dirty=true;if(record.type==='attributes'&&record.attributeName==='class')libraryLayoutEpoch++;}
    else if(record.type==='attributes'&&target?.querySelector?.(CARD)){libraryTextEpoch++;libraryLayoutEpoch++;}
  }
}
function libraryBook(card){
  let cached=libraryBookCache.get(card);
  if(cached&&!cached.dirty&&cached.epoch===libraryTextEpoch)return cached.book;
  if(!cached){cached={book:{}};libraryBookCache.set(card,cached);}
  const link=card.querySelector('a[href*="/page/"]');
  Object.assign(cached.book,{id:link?.getAttribute('href')?.match(/\/page\/(\d+)/)?.[1],title:readText(card.querySelector(TITLE)),abstract:readText(card.querySelector(ABSTRACT)),author:readText(card.querySelector('.book-item-text > .author,.book-item-text > .book-item-desc')).replace(/^作者[：:]\s*/,'')});
  cached.dirty=false;cached.epoch=libraryTextEpoch;return cached.book;
}
const observer = new MutationObserver(records => {
  invalidateLibraryCards(records);clearTimeout(timer);timer=setTimeout(scan,120);
});
const observe=()=>observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class','href']});
window.addEventListener('resize',()=>{clearTimeout(timer);timer=setTimeout(scan,120);});
function alignLibraryCards(){
  for(const list of document.querySelectorAll('.muye-stack-book-list')){
    if(list.hasAttribute('data-fq-native-hidden'))continue;
    const cards=[...list.children].filter(child=>child.matches('.stack-book-item'));
    if(!cards.some(card=>card.getAttribute(MARK)==='hide')){
      if(list.hasAttribute(LAYOUT)){list.removeAttribute(LAYOUT);list.style.removeProperty('--fq-column-gap');}
      continue;
    }
    const width=innerWidth,boxWidth=list.clientWidth,cached=libraryGapCache.get(list);
    if(!cached||cached.width!==width||cached.boxWidth!==boxWidth||cached.epoch!==libraryLayoutEpoch){
      // The native layout repeats nth-child spacing. Sample its first four rows, not every book.
      list.removeAttribute(LAYOUT);list.style.removeProperty('--fq-column-gap');
      const gap=Math.max(0,...cards.slice(0,12).map(card=>parseFloat(getComputedStyle(card).marginRight)||0));
      libraryGapCache.set(list,{width,boxWidth,epoch:libraryLayoutEpoch,gap});
    }
    const gap=libraryGapCache.get(list).gap+'px';
    if(list.style.getPropertyValue('--fq-column-gap')!==gap)list.style.setProperty('--fq-column-gap',gap);
    if(!list.hasAttribute(LAYOUT))list.setAttribute(LAYOUT,'aligned');
  }
}
