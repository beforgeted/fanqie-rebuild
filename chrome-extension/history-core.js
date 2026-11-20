// GPL-3.0-or-later. Shared local history storage logic.
// Shared with the extension service worker. Each book has its own key; writes
  // are serialized by the caller so records/handled marks survive tab races.
  async function historyOperation(storage, message) {
    const prefix = 'fq-history-book-';
    const validId = id => typeof id === 'string' && /^\d{5,25}$/.test(id);
    const keyOf = id => prefix + id;
    const cleanMatches = matches => [...new Set((Array.isArray(matches) ? matches : [])
      .filter(x => typeof x === 'string').map(x => x.slice(0,200)))];
    if (message.action === 'list') {
      const all = await storage.all();
      return Object.entries(all).filter(([key, value]) => key.startsWith(prefix) && value &&
        validId(value.id) && key === keyOf(value.id) && typeof value.title === 'string')
        .map(([,value]) => value).sort((a,b) => b.lastSeen - a.lastSeen || a.id.localeCompare(b.id));
    }
    if (message.action === 'record') {
      const entries = Array.isArray(message.records) ? message.records : [];
      const updates = {};
      for (const entry of entries) {
        if (!entry || !validId(entry.id) || typeof entry.title !== 'string' || !entry.title.trim()) continue;
        const key = keyOf(entry.id);
        const previous = updates[key] || await storage.get(key) || {};
        const now = Date.now();
        updates[key] = {
          id:entry.id, title:entry.title.slice(0,500),
          author:typeof entry.author === 'string' ? entry.author.slice(0,200) : previous.author || '',
          url:'https://fanqienovel.com/page/' + entry.id,
          matches:cleanMatches([...(previous.matches || []), ...cleanMatches(entry.matches)]),
          firstSeen:previous.firstSeen || now, lastSeen:now,
          handledAt:previous.handledAt || 0
        };
      }
      if (Object.keys(updates).length) await storage.set(updates);
      return {recorded:Object.keys(updates).length};
    }
    if (message.action === 'mark' && validId(message.id)) {
      const key = keyOf(message.id), previous = await storage.get(key);
      if (!previous) throw new Error('这本书的记录已不存在');
      await storage.set({[key]:{...previous,handledAt:message.handled === true ? Date.now() : 0}});
      return {ok:true};
    }
    throw new Error('无效的记录操作');
  }
