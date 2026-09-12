import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, readdirSync, statSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { RATE_SOURCE, parseRateResponse, validateRate, readRateCache, writeRateCache, refreshRate, formatSgdCost, needsRefresh, REFRESH_AFTER_MS } from '../sgd-rate.mjs';
const now=Date.parse('2026-01-12T12:00:00.000Z');
const payload={amount:1,base:'USD',date:'2026-01-12',rates:{SGD:1.25}};
const record=parseRateResponse(payload,now);
function file(t){const dir=mkdtempSync(join(tmpdir(),'sgd-cache-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));return {dir,path:join(dir,'usd-sgd.json')}}
const response=(data=payload)=>({ok:true,text:async()=>JSON.stringify(data)});

test('explicit base, quote, source observation and fetch timestamps',()=>{
 assert.deepEqual(record,{schema:1,base:'USD',quote:'SGD',rate:1.25,asOf:'2026-01-12',fetchedAt:'2026-01-12T12:00:00.000Z',source:RATE_SOURCE});
 assert.equal(needsRefresh(record,now),false);assert.equal(needsRefresh(record,now+REFRESH_AFTER_MS),true);
});
test('multiply accumulated USD exactly once then round; zero requires a valid rate',()=>{
 assert.equal(formatSgdCost(1.7535,record),'2.192');
 assert.equal(formatSgdCost(.0004+.0004,record),'0.001');
 assert.equal(formatSgdCost(0,record),'0.000');
 assert.equal(formatSgdCost(0,undefined),'—');assert.equal(formatSgdCost(10,undefined),'—');
 for(const rate of [0,-1,NaN,Infinity,'1.25'])assert.equal(formatSgdCost(10,{rate}),'—');
 assert.equal(formatSgdCost(Number.MAX_VALUE,{rate:2}),'—');
});
test('reject invalid base/amount/rate/date and malformed cached metadata',()=>{
 for(const change of [{base:'SGD'},{amount:10},{rates:{SGD:0}},{rates:{SGD:-1}},{rates:{SGD:Infinity}},{rates:{SGD:'1.25'}},{rates:{}},{date:'2026-02-31'},{date:'2027-01-12'},{date:'garbage'}])assert.throws(()=>parseRateResponse({...payload,...change},now));
 for(const change of [{schema:2},{quote:'USD'},{base:'SGD'},{source:'http://untrusted'},{fetchedAt:'2026-01-13T00:00:00.000Z'},{fetchedAt:'garbage'},{fetchedAt:'2026-01-11T00:00:00.000Z'}])assert.throws(()=>validateRate({...record,...change},now));
});
test('valid HTTPS refresh commits atomic complete cache with restricted mode',async t=>{
 const {dir,path}=file(t);let calls=0;
 const result=await refreshRate({path,now,fetchImpl:async(url,options)=>{calls++;assert.equal(url,RATE_SOURCE);assert.equal(options.redirect,'error');assert.ok(options.signal);return response()}});
 assert.equal(result.status,'refreshed');assert.equal(calls,1);assert.deepEqual(readRateCache(path,now),record);
 assert.deepEqual(readdirSync(dir),['usd-sgd.json']);assert.equal(statSync(path).mode&0o777,0o600);
});
for(const kind of ['offline','http','json','invalid','timeout','body-timeout','older'])test(`${kind} refresh retains byte-for-byte last-known-good`,async t=>{
 const {path}=file(t);writeRateCache(record,path);const before=readFileSync(path,'utf8');
 const fetchImpl=async()=>{
  if(kind==='offline')throw new Error('offline');
  if(kind==='http')return {ok:false,status:503};
  if(kind==='json')return {ok:true,text:async()=>'{bad'};
  if(kind==='invalid')return response({...payload,rates:{SGD:0}});
  if(kind==='older')return response({...payload,date:'2026-01-09'});
  if(kind==='body-timeout')return {ok:true,text:()=>new Promise(()=>{})};
  return new Promise(()=>{}); // deliberately uncooperative transport: deadline still bounds caller.
 };
 const start=performance.now();const result=await refreshRate({path,now,timeoutMs:20,fetchImpl});
 assert.equal(result.status,'retained');assert.deepEqual(result.rate,record);assert.equal(readFileSync(path,'utf8'),before);
 assert.ok(performance.now()-start<1000);
});
test('missing/malformed cache + offline is explicitly unavailable, never creates zero or USD cache',async t=>{
 const {path}=file(t);assert.equal(readRateCache(path),undefined);
 let result=await refreshRate({path,now,fetchImpl:async()=>{throw new Error('offline')}});
 assert.equal(result.status,'unavailable');assert.equal(result.rate,undefined);
 writeFileSync(path,'{"base":"USD","rate":0}');
 result=await refreshRate({path,now,fetchImpl:async()=>response({...payload,rates:{SGD:NaN}})});
 assert.equal(result.status,'unavailable');assert.equal(readFileSync(path,'utf8'),'{"base":"USD","rate":0}');
});
test('missing cache bootstraps via one valid request; stale cache remains readable offline',async t=>{
 const {path}=file(t);await refreshRate({path,now,fetchImpl:async()=>response()});
 const stale=now+7*REFRESH_AFTER_MS;
 const result=await refreshRate({path,now:stale,fetchImpl:async()=>{throw new Error('offline')}});
 assert.equal(result.status,'retained');assert.equal(formatSgdCost(2,result.rate),'2.500');
});
test('aborted refresh never changes cache',async t=>{
 const {path}=file(t);writeRateCache(record,path);const abort=new AbortController();abort.abort();let called=false;
 const result=await refreshRate({path,now,signal:abort.signal,fetchImpl:async()=>{called=true;return response()}});
 assert.equal(result.status,'retained');assert.equal(called,false);assert.deepEqual(readRateCache(path,now),record);
});
test('failed atomic rename retains existing cache and cleans temporary file',t=>{
 const {dir}=file(t);assert.throws(()=>writeRateCache(record,dir));assert.deepEqual(readdirSync(dir),[]);
});
