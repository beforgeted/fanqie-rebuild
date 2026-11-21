function safeCover(value){try{const u=new URL(value,location.origin);return value&&u.protocol==='https:'&&!u.pathname.includes('/novel-static/5cb03bd354145bc7815a5e09d4b15cfc')?u.href:'';}catch{return '';}}
function pageBookData(doc,id){
  const script=[...doc.scripts].find(el=>el.textContent.includes('window.__INITIAL_STATE__='))?.textContent;if(!script)return {};
  const start=script.indexOf('window.__INITIAL_STATE__=')+'window.__INITIAL_STATE__='.length;let depth=0,quoted=false,escaped=false,end=start;
  for(;end<script.length;end++){const c=script[end];if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;}else if(c==='"')quoted=true;else if(c==='{')depth++;else if(c==='}'&&!--depth){end++;break;}}
  try{const data=parseOfficialJSON(script.slice(start,end)).page;return String(data?.bookId)===id?data:{};}catch{return {};}
}
async function fetchBookDetails(id,force=false){
  let cached=introCache.get(id);
  if(force||!cached||Date.now()-cached.time>600000){
    const promise=(async()=>{const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);try{
      const response=await fetch('/page/'+id,{credentials:'same-origin',cache:'no-store',signal:controller.signal});
      if(!response.ok)throw Error('请求失败');
      const doc=new DOMParser().parseFromString(await response.text(),'text/html'),body=doc.querySelector('.page-abstract-content');
      if(!body||!body.textContent.trim())throw Error('暂无完整简介');
      const data=pageBookData(doc,id);
      return {title:readText(doc.querySelector('h1')).trim(),abstract:readText(body).trim(),author:readText(doc.querySelector('.author-name')).trim(),cover:safeCover(data.thumbUri||doc.querySelector('.page-header .book-cover-img,.book-cover-img')?.getAttribute('src')),meta:[...[...doc.querySelectorAll('.info-label > *, .info-count')].map(e=>readText(e).trim()),...(!doc.querySelector('.info-label > *')?[readText(doc.querySelector('.info-label')).trim()]:[])].filter(Boolean).join(' · ')};
    }finally{clearTimeout(timer);}})();
    cached={time:Date.now(),promise};introCache.set(id,cached);if(introCache.size>60)introCache.delete(introCache.keys().next().value);
  }
  try{return await cached.promise;}catch(error){if(introCache.get(id)===cached)introCache.delete(id);throw error;}
}
