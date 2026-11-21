let choices=new Map(),choiceStamp='',choiceBusy=false,suppressAutoUntil=0;
try {choices=new Map((await historyCall({action:'choices'})).map(r=>[r.id,r]));}catch{}
const choiceHost=document.createElement('div');choiceHost.id='fq-choice-host';
choiceHost.style.cssText='display:block;max-width:1160px;margin:20px auto;';
const cs=choiceHost.attachShadow({mode:'open'});
cs.innerHTML='<style>:host{font:14px/1.6 system-ui;color:#292524}*{box-sizing:border-box}button,select,input{font:inherit}button{cursor:pointer;background:white;border:1px solid #d6d3d1;border-radius:7px;padding:6px 10px;margin:3px}button:disabled{opacity:.5}#box{width:100%;padding:24px;background:#fff;border:1px solid #eee;border-radius:6px}[hidden]{display:none!important}#rows>div{padding:10px 0;border-bottom:1px solid #eee}a{color:#a83e19}#msg{font-size:12px;color:#a83e19}input{width:100%}</style><button id="open">我的选书</button><section id="box" hidden><strong>我的选书 · 本地标记</strong><div id="current"></div><div id="msg" role="status"></div><select id="filter"><option value="later">候选</option><option value="skip">不想看</option></select><input id="query" placeholder="搜索书名或作者"><div id="official-tools" hidden><p>候选保存在本地。加入官方“待看”后，同账号手机可同步；清除本地候选不会移除官方书籍。</p><div class="sync-toolbar"><button id="sync-select">全选当前结果</button><button id="sync-batch">加入官方待看</button><button id="sync-retry">重试失败</button><button id="sync-refresh">刷新同步状态</button></div><p id="sync-message" role="status"></p><div id="sync-review" hidden></div></div><div id="rows"></div><button id="close">收起</button></section>';
document.body.append(choiceHost);
let choiceListOpen=false;
const detailActions=document.createElement('span');detailActions.className='fq-detail-choices';detailActions.style.cssText='display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0';
const detailFeedback=document.createElement('div');detailFeedback.className='fq-detail-feedback';detailFeedback.style.cssText='font:12px/1.6 system-ui;color:#777;min-width:0;overflow-wrap:anywhere';detailFeedback.setAttribute('role','status');
const layoutStyle=document.createElement('style');
layoutStyle.textContent=`
  .page-header-info:has(.fq-detail-choices){height:auto!important;overflow:visible!important;display:flow-root}
  .page-header-info .info:has(.fq-detail-choices){display:grid!important;grid-template-columns:150px 150px minmax(32px,1fr);column-gap:10px;row-gap:0;height:auto!important;min-height:234px;overflow:visible!important}
  .info:has(.fq-detail-choices)>.info-name{grid-area:1/1/2/-1;min-width:0}
  .info:has(.fq-detail-choices)>.info-label{grid-area:2/1/3/-1;min-width:0}
  .info:has(.fq-detail-choices)>.info-count{grid-area:3/1/4/-1;min-width:0}
  .info:has(.fq-detail-choices)>.info-last{grid-area:4/1/5/-1;min-width:0;margin-bottom:14px}
  .info:has(.fq-detail-choices)>.info-btn,.info:has(.fq-detail-choices)>.add-bookshelf-btn,.info:has(.fq-detail-choices)>.download-icon{position:relative!important;left:auto!important;right:auto!important;top:auto!important;bottom:auto!important;margin:0!important;align-self:center}
  .info:has(.fq-detail-choices)>.info-btn{grid-area:5/1/6/2}
  .info:has(.fq-detail-choices)>.add-bookshelf-btn{grid-area:5/2/6/3}
  .info:has(.fq-detail-choices)>.download-icon{grid-area:5/3/6/4;justify-self:start}
  .info>.fq-detail-choices{grid-area:6/1/7/-1;padding-top:12px}
  .info>.fq-detail-feedback{grid-area:7/1/8/-1}
  .info>.fq-detail-feedback:not(:empty){padding-top:6px}
`;document.head.append(layoutStyle);
const navChoice=document.createElement('div');navChoice.className='nav-item';
const navLink=document.createElement('a');navLink.href='#fq-my-books';navLink.textContent='我的选书';navChoice.append(navLink);
navLink.onclick=e=>{e.preventDefault();if(drawerTab)closeDrawer();else openDrawer('later');};
const cq=id=>cs.getElementById(id);
