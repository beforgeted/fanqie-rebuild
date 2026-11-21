let profileState=filterState(GM_getValue(STORE, {}));
let config={words:profileState.words,enabled:profileState.enabled,abstract:profileState.abstract};
let matchFilterWords=compileFilterWords(config.words);
let drawerReady=false,drawerTab=null,drawer=null,drawerReturn=null,drawerRulesLoaded=false;
let intro=null;
let reveal = false;
let timer;
let lastPath = location.pathname + location.search;
const normalize = filterNormalize;
const selectionHostRoute=()=>/^\/(?:library|bookshelf)(?:\/|$)/.test(location.pathname);
const isSelectionPage = () => selectionHostRoute() && (new URLSearchParams(location.search).get('fq_view') === 'selection' || /^#fq-selection\//.test(location.hash));
const selectionTab = () => {const tab=location.hash.replace(/^#(?:fq-selection\/)?/,'');return ['later','skip','backup'].includes(tab)?tab:'later';};
const selectionURL = tab => {
  const value=['later','skip','backup'].includes(tab)?tab:'later';
  if(selectionHostRoute()&&new URLSearchParams(location.search).get('fq_view')!=='selection')return location.pathname+location.search+'#fq-selection/'+value;
  return '/library?fq_view=selection#'+value;
};
const supportedPage = () => !isSelectionPage() && /^\/(?:library|rank)(?:\/|$)/.test(location.pathname);

const readText=createTextReader({fonts:FONTS,cardSelector:CARD});
