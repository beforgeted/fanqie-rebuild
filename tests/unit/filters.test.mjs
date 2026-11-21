import {test} from 'node:test';import assert from 'node:assert/strict';import {compileFilterWords,filterNormalize} from '../../src/core/filters.mjs';
const reference=(words,fields)=>words.map(word=>({word,key:filterNormalize(word)})).filter(e=>e.key&&fields.map(filterNormalize).some(t=>t.includes(e.key))).map(e=>e.word);
test('关键词索引与原匹配语义一致：重叠、重复、顺序、跨字段、标点与 Unicode',()=>{
 const words=['星铁','星','Ａ B','😀','原神','原','神','a-b','星铁','；','𠮷野'];
 for(const fields of [['原神与星铁😀','Ａ，Ｂ 𠮷野'],['原','神'],['',''],['星铁星','ab']])assert.deepEqual(compileFilterWords(words)(fields),reference(words,fields));
 let seed=123;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed;};const chars=['原','神','星','铁','a','Ａ',' ','，','😀','𠮷'];
 const str=n=>Array.from({length:n},()=>chars[random()%chars.length]).join('');
 for(let run=0;run<100;run++){const keys=Array.from({length:80},()=>str(1+random()%6)),fields=[str(80),str(40)];assert.deepEqual(compileFilterWords(keys)(fields),reference(keys,fields));}
});
