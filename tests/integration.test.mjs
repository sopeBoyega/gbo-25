import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createHmac, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { createApp } from '../server.mjs';
const sharp=createRequire(import.meta.url)('sharp');
const password='test-only-password-with-32-characters';
const secret='test-only-secret-not-for-production-123456';
const origin='http://localhost:3000';
function token(){const v=`${Date.now()-2000}.test`;return `${v}.${createHmac('sha256',secret).update(v).digest('hex')}`;}
async function fixture(){
  const dir=await mkdtemp(join(tmpdir(),'gbo-test-'));
  const opts={DATA_DIR:dir,ADMIN_PASSWORD:password,RATE_SECRET:secret,APP_ORIGIN:origin,NODE_ENV:'test',TRUST_PROXY:'0'};
  let server,base;
  const start=async()=>{server=createApp(opts);server.listen(0,'127.0.0.1');await once(server,'listening');base=`http://127.0.0.1:${server.address().port}`;};
  const stop=async()=>{server.close();server.closeAllConnections();await once(server,'close');};
  await start();
  return {request:(path,method='GET',body,cookie,other={})=>fetch(base+path,{method,headers:{Origin:origin,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{}),...other},...(body!==undefined?{body:JSON.stringify(body)}:{})}),restart:async()=>{await stop();await start();},close:async()=>{await stop();await rm(dir,{recursive:true,force:true});}};
}
const entry=extra=>({name:'A friend',message:'More life, Gbo!',consent:true,website:'',requestId:randomUUID(),token:token(),...extra});
async function signIn(f){const response=await f.request('/api/admin/login','POST',{password});assert.equal(response.status,200);assert.match(response.headers.get('set-cookie'),/HttpOnly; SameSite=Strict/);return response.headers.get('set-cookie').split(';')[0];}

test('messages and photos stay private until approval; survive restart; can be unpublished and deleted',async()=>{
  const f=await fixture();
  try{
    const original=await sharp({create:{width:40,height:30,channels:3,background:'#ed292d'}}).jpeg().withMetadata().toBuffer();
    const input=entry({photo:original.toString('base64'),message:"<img src=x onerror=alert(1)> '); DROP TABLE entries;--"});
    const created=await f.request('/api/entries','POST',input);assert.equal(created.status,202);const {id}=await created.json();
    assert.equal((await (await f.request('/api/entries')).json()).entries.length,0);
    assert.equal((await f.request(`/api/photos/${id}`)).status,404);
    assert.equal((await f.request(`/api/admin/photos/${id}`)).status,401);
    assert.equal((await f.request('/api/admin/entries')).status,401);
    assert.equal((await (await f.request('/api/entries','POST',input)).json()).id,id);
    const cookie=await signIn(f);
    const queue=await (await f.request('/api/admin/entries','GET',undefined,cookie)).json();assert.equal(queue.entries.length,1);assert.equal(queue.entries[0].message,input.message);
    const privatePhoto=await f.request(`/api/admin/photos/${id}`,'GET',undefined,cookie);assert.equal(privatePhoto.status,200);
    const metadata=await sharp(Buffer.from(await privatePhoto.arrayBuffer())).metadata();assert.equal(metadata.format,'jpeg');assert.equal(metadata.exif,undefined);assert.equal(metadata.icc,undefined);
    assert.equal((await f.request('/api/admin/moderate','POST',{id,action:'approve'},cookie)).status,200);
    await f.restart();
    const published=await (await f.request('/api/entries?filter=photos')).json();assert.equal(published.entries.length,1);assert.equal(published.totals.photos,1);
    const photo=await f.request(`/api/photos/${id}`);assert.equal(photo.status,200);assert.equal(photo.headers.get('content-type'),'image/jpeg');assert.equal(photo.headers.get('cache-control'),'no-store');
    await f.request('/api/admin/moderate','POST',{id,action:'hide'},cookie);assert.equal((await f.request(`/api/photos/${id}`)).status,404);
    await f.request('/api/admin/moderate','POST',{id,action:'delete'},cookie);assert.equal((await f.request(`/api/admin/photos/${id}`,'GET',undefined,cookie)).status,404);
    await f.request('/api/admin/logout','POST',{},cookie);assert.equal((await f.request('/api/admin/entries','GET',undefined,cookie)).status,401);
  }finally{await f.close();}
});

test('rejects invalid uploads, missing consent, stale tokens and cross-origin writes',async()=>{
  const f=await fixture();try{
    assert.equal((await f.request('/api/entries','POST',entry(),undefined,{Origin:'https://evil.example'})).status,403);
    assert.equal((await f.request('/api/entries','POST',entry({consent:false}))).status,400);
    assert.equal((await f.request('/api/entries','POST',entry({token:'broken'}))).status,400);
    assert.equal((await f.request('/api/entries','POST',entry({website:'spam.example'}))).status,400);
    assert.equal((await f.request('/api/entries','POST',entry({photo:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>').toString('base64')}))).status,400);
    assert.equal((await f.request('/api/entries','POST',entry({photo:Buffer.from('not an image').toString('base64')}))).status,400);
    assert.equal((await f.request('/api/entries','POST',entry({message:'x'.repeat(1201)}))).status,400);
    assert.equal((await f.request('/api/entries','POST',entry({photo:Buffer.alloc(4*1024*1024+1).toString('base64')}))).status,413);
    assert.equal((await f.request('/.env')).status,404);assert.equal((await f.request('/schema.sql')).status,404);
    const home=await f.request('/');assert.equal(home.status,200);assert.match(home.headers.get('content-security-policy'),/frame-ancestors 'none'/);
  }finally{await f.close();}
});

test('rate limiting persists across restart and ignores spoofed forwarded addresses by default',async()=>{
  const f=await fixture();try{
    for(let i=0;i<8;i++){const r=await f.request('/api/entries','POST',entry(),undefined,{'X-Forwarded-For':`1.2.3.${i}`});assert.equal(r.status,202);}
    await f.restart();assert.equal((await f.request('/api/entries','POST',entry())).status,429);
  }finally{await f.close();}
});

test('login attempts are limited and forged sessions are denied',async()=>{
  const f=await fixture();try{
    for(let i=0;i<5;i++)assert.equal((await f.request('/api/admin/login','POST',{password:'incorrect'})).status,401);
    assert.equal((await f.request('/api/admin/login','POST',{password})).status,429);
    assert.equal((await f.request('/api/admin/entries','GET',undefined,'gbo_session='+'a'.repeat(64))).status,401);
  }finally{await f.close();}
});
