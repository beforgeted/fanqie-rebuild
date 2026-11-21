let profileState=filterState(GM_getValue(STORE, {}));
let config={words:profileState.words,enabled:profileState.enabled,abstract:profileState.abstract};
let matchFilterWords=compileFilterWords(config.words);
let drawerReady=false,drawerTab=null,drawer=null,drawerReturn=null,drawerRulesLoaded=false;
let intro=null;
let reveal = false;
let timer;
let lastPath = location.pathname + location.search;
const normalize = filterNormalize;
const isSelectionPage = () => /^\/library\/?$/.test(location.pathname) && new URLSearchParams(location.search).get('fq_view') === 'selection';
const selectionURL = tab => '/library?fq_view=selection#' + (['later','skip','backup'].includes(tab) ? tab : 'later');
const supportedPage = () => !isSelectionPage() && /^\/(?:library|rank)(?:\/|$)/.test(location.pathname);

const readText=createTextReader({fonts:FONTS,cardSelector:CARD});
