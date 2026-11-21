let profileState=filterState(GM_getValue(STORE, {}));
let config={words:profileState.words,enabled:profileState.enabled,abstract:profileState.abstract};
let matchFilterWords=compileFilterWords(config.words);
let drawerReady=false,drawerTab=null,drawer=null,drawerReturn=null,drawerRulesLoaded=false;
let intro=null;
let reveal = false;
let timer;
let lastPath = location.pathname + location.search;
const normalize = filterNormalize;
const supportedPage = () => /^\/(?:library|rank)(?:\/|$)/.test(location.pathname);

const readText=createTextReader({fonts:FONTS,cardSelector:CARD});
