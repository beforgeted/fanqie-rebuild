const observer = new MutationObserver(() => {
  clearTimeout(timer);
  timer = setTimeout(scan, 120);
});
const observe = () => observer.observe(document.body, {subtree:true, childList:true, characterData:true, attributes:true, attributeFilter:['class']});
function alignLibraryCards() {
  for (const list of document.querySelectorAll('.muye-stack-book-list')) {
    // nth-child spacing counts hidden books too. Let flex gap space only the
    // visible cards, preserving native widths, wrapping, and vertical margins.
    list.removeAttribute(LAYOUT);
    list.style.removeProperty('--fq-column-gap');
    const cards = [...list.children].filter(child=>child.matches('.stack-book-item'));
    if (!cards.some(card=>card.getAttribute(MARK)==='hide')) continue;
    const gap = Math.max(0,...cards.map(card=>parseFloat(getComputedStyle(card).marginRight)||0));
    list.style.setProperty('--fq-column-gap',gap+'px');
    list.setAttribute(LAYOUT,'aligned');
  }
}
