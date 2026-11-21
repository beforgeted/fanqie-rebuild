function scan() {
  observer.disconnect();
  try {
    const active = supportedPage();
    host.hidden = drawerReady?false:!active;
    if (!active) {
      document.querySelectorAll(`[${MARK}]`).forEach(card => card.removeAttribute(MARK));
      alignLibraryCards();
      return;
    }

    const cards = [...document.querySelectorAll(CARD)].filter(card=>!card.closest('[data-fq-native-hidden]'));
    let hits = 0, unknown = 0;
    const records = [];
    for (const card of cards) {
      const fields = [readText(card.querySelector(TITLE))];
      if (config.abstract) fields.push(readText(card.querySelector(ABSTRACT)));
      if (fields.some(text => /[\ue000-\uf8ff]/u.test(text))) unknown++;
      const idForChoice=attachChoices(card);
      const matches=config.enabled?matchFilterWords(fields):[];
      const keywordHit = matches.length>0;
      const hit=keywordHit||choices.get(idForChoice)?.state==='skip';
      if (hit) {
        hits++; card.setAttribute(MARK, reveal ? 'show' : 'hide');
        const bookLink = card.querySelector('a[href*="/page/"]');
        const id = bookLink?.getAttribute('href')?.match(/\/page\/(\d+)(?:[/?#]|$)/)?.[1];
        if (id && keywordHit) {
          const author = readText(card.querySelector('.book-item-text > .author, .book-item-text > .book-item-desc')).replace(/^作者\s*[：:]\s*/,'').trim();
          records.push({id,title:fields[0].trim() || '书籍 '+id,author,matches});
        }
      }
      else card.removeAttribute(MARK);
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
