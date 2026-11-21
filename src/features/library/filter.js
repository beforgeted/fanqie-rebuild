const libraryMatchCache=new WeakMap();
function scan() {
  invalidateLibraryCards(observer.takeRecords());observer.disconnect();
  try {
    const active = supportedPage();
    host.hidden = drawerReady?false:!active;
    if (!active) {
      if(isSelectionPage())return; // Keep the hidden library's filtering and layout intact.
      document.querySelectorAll(`[${MARK}]`).forEach(card => card.removeAttribute(MARK));
      alignLibraryCards();
      return;
    }

    const cards = [...document.querySelectorAll(CARD)].filter(card=>!card.closest('[data-fq-native-hidden]'));
    let hits = 0, unknown = 0;
    const records = [];
    for (const card of cards) {
      const book=libraryBook(card),fields=[book.title];
      if(config.abstract)fields.push(book.abstract);
      if (fields.some(text => /[\ue000-\uf8ff]/u.test(text))) unknown++;
      const idForChoice=attachChoices(card,book);
      let matches=[];
      if(config.enabled){
        const cached=libraryMatchCache.get(card);
        if(cached&&cached.matcher===matchFilterWords&&cached.abstract===config.abstract&&cached.title===book.title&&cached.description===book.abstract)matches=cached.matches;
        else{matches=matchFilterWords(fields);libraryMatchCache.set(card,{matcher:matchFilterWords,abstract:config.abstract,title:book.title,description:book.abstract,matches});}
      }
      const keywordHit = matches.length>0;
      const hit=keywordHit||choices.get(idForChoice)?.state==='skip';
      if (hit) {
        hits++;const mark=reveal?'show':'hide';if(card.getAttribute(MARK)!==mark)card.setAttribute(MARK,mark);
        const id=book.id;
        if (id && keywordHit) {
          const author=book.author.trim();
          records.push({id,title:fields[0].trim() || '书籍 '+id,author,matches});
        }
      }
      else if(card.hasAttribute(MARK))card.removeAttribute(MARK);
    }
    alignLibraryCards();
    $('open').textContent = config.enabled ? `关键词屏蔽 · ${hits} 本` : '关键词屏蔽 · 已暂停';
    $('status').textContent = `本页识别 ${cards.length} 本，${reveal ? '命中' : '已隐藏'} ${hits} 本。`;
    $('warning').textContent = unknown ? `${unknown} 本含尚未识别的字体字符，可能漏屏蔽。` : cards.length ? '' : '尚未识别到书籍；请等加载完成。若列表已出现，网站结构可能已更新。';
    $('reveal').textContent = reveal ? '重新隐藏命中书籍' : '临时显示已屏蔽';
    rememberCards(records);
    if(drawerReady)updateFilterBar(cards.length,hits);
    if (typeof stream !== 'undefined') updateStreamStatus();
  } finally { observe(); }
}
