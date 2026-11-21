export function createTextReader({fonts, cardSelector}) {
return function readText(element) {
  if (!element) return '';
  const walker = element.ownerDocument.createTreeWalker(element, 4);
  let result = '', node;
  while ((node = walker.nextNode())) {
    let table;
    for (let parent = node.parentElement; parent; parent = parent.parentElement) {
      const font = [...parent.classList].find(c => c.startsWith('font-'));
      if (font) { table = fonts[font.slice(5)]; break; }
      if (parent.matches(cardSelector)) break;
    }
    result += [...node.nodeValue].map(char => {
      const index = char.codePointAt(0) - 58344;
      return table?.length === 372 && index >= 0 && index < 372 && table[index] !== '?' ? table[index] : char;
    }).join('');
  }
  return result;
}
}
