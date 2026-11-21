function parseOfficialJSON(text) {
  // Keep long account/book/group IDs exact; never round them through JS Number.
  return JSON.parse(text.replace(/"(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g,
    token=>/^-?\d{16,}$/.test(token)?'"'+token+'"':token));
}
function createOfficialShelfClient({fetchImpl,csrf,delay=ms=>new Promise(r=>setTimeout(r,ms))}) {
  const query='?aid=1967&iid=0&version_code=57700&update_version_code=57700';
  const base='/reading/bookapi/bookshelf/';
  async function request(url,body){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
    try{
      const options={credentials:'same-origin',cache:'no-store',signal:controller.signal};
      if(body){const token=csrf();if(!token)throw Error('登录校验已失效，请重新登录番茄后重试。');Object.assign(options,{method:'POST',headers:{'Content-Type':'application/json','x-secsdk-csrf-token':token},body:JSON.stringify(body)});}
      const response=await fetchImpl(url,options);
      if(!response.ok)throw Error('官方请求失败（HTTP '+response.status+'），请稍后重试。');
      let data;try{data=parseOfficialJSON(await response.text());}catch{throw Error('官方返回了无法识别的数据，请稍后重试。');}
      if(data.code===undefined||data.code===null||Number(data.code)!==0)throw Error('官方未接受请求：'+String(data.message||data.msg||data.code).slice(0,180));
      return data.data;
    }catch(error){if(error.name==='AbortError')throw Error('请求超时，结果待核验；重试会先检查官方书架。');throw error;}
    finally{clearTimeout(timer);}
  }
  async function account(){const data=await request('/api/user/info/v2');const id=String(data?.id||data?.user_id||data?.uid||'');if(!/^\d+$/.test(id))throw Error('请先在番茄官网登录账号。');return id;}
  async function read(){const data=await request(base+'info/v:version/'+query);if(!Array.isArray(data?.book_shelf_info))throw Error('无法读取官方书架，请刷新或重新登录。');return data.book_shelf_info;}
  async function checkAccount(expected){if(await account()!==expected)throw Error('登录账号已切换，已停止同步，请刷新同步状态后重试。');}
  const find=(rows,id)=>rows.find(row=>String(row.book_id)===id);
  const inTarget=row=>!!row?.group_id&&row.group_name==='待看';
  async function verify(id,predicate){for(let attempt=0;attempt<3;attempt++){if(attempt)await delay(attempt*350);const rows=await read();if(predicate(find(rows,id)))return rows;}throw Error('官方尚未确认保存，结果待核验；重试会先检查书架。');}
  async function syncOne(id,{accountId,allowedGroup='',onStage=async()=>{}}){
    if(!/^\d{5,25}$/.test(id))throw Error('无效书籍 ID');
    await checkAccount(accountId);let rows=await read(),book=find(rows,id);
    if(inTarget(book))return {groupId:String(book.group_id),already:true};
    const checkMove=()=>{if(book?.group_id&&!inTarget(book)&&String(book.group_id)!==allowedGroup)throw Error('该书已在官方「'+(book.group_name||'其他分组')+'」，请重新选择并确认移动。');};
    checkMove();
    if(!book){
      await onStage('adding');await checkAccount(accountId);
      await request(base+'add/v:version/'+query,{identify_data:[{book_id:id,book_type:0,asterisked:false,modify_time:Date.now()}],add_book_source:0});
      rows=await verify(id,Boolean);book=find(rows,id);
    }
    if(inTarget(book))return {groupId:String(book.group_id),already:true};
    checkMove();
    const targets=[...new Set(rows.filter(inTarget).map(row=>String(row.group_id)))];
    if(targets.length>1)throw Error('官方书架有多个同名“待看”分组，请先整理为一个再重试。');
    const item={book_id:id,book_type:book.book_type??0,modify_time:Date.now(),group_name:'待看'};
    if(targets.length)item.group_id=targets[0];
    await onStage('moving');await checkAccount(accountId);
    await request(base+'update/v:version/'+query,{book_data:[item]});
    await onStage('verifying');rows=await verify(id,row=>inTarget(row)&&(!targets.length||String(row.group_id)===targets[0]));
    await checkAccount(accountId);
    return {groupId:String(find(rows,id).group_id),already:false};
  }
  return {account,read,syncOne,inTarget};
}

export { parseOfficialJSON, createOfficialShelfClient };
