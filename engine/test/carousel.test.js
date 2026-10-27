import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { parsePost } from '../src/frontmatter.js';
import { planPost, renderPack, verifyPack, deliverPack, readJson, atomicJson, RECIPIENT, COLORS, createPlan, carouselModelDeps, prepareCachedPlan } from '../src/carousel.js';
import { generateVisual, IMAGE_ENDPOINT } from '../src/carousel-image.js';
import { run, carouselDeps } from '../src/jobs/carousel.js';

const raw=await readFile(new URL('../../content/posts/why-wake-3am-menopause.md',import.meta.url),'utf8');
const post=parsePost(raw);
const image=await sharp({create:{width:1024,height:1280,channels:3,background:'#6E3A10'}}).png().toBuffer();
const temp=()=>mkdtemp(path.join(tmpdir(),'carousel-test-'));

test('approval, path and HTTPS-source gates fail closed',()=>{
  assert.throws(()=>planPost({...post,status:'draft'},raw),/approved/);
  assert.throws(()=>planPost({...post,slug:'../escape'},raw),/slug/);
  assert.throws(()=>planPost({...post,sources:[{url:'http://example.com'}]},raw),/HTTPS/);
  assert.throws(()=>planPost({...post,faq:[]},raw),/FAQs/);
  assert.throws(()=>planPost(post,raw,planPost(post,raw).slides.map(s=>({...s,body:'word '.repeat(30)}))),/scannable/);
});
test('all three current posts have short source-grounded copy, six graphic panels and source URLs',async()=>{
  for(const slug of ['why-wake-3am-menopause','cant-get-back-to-sleep-menopause','night-sweats-waking-me-up-every-night-options']) {
    const text=await readFile(new URL(`../../content/posts/${slug}.md`,import.meta.url),'utf8');
    const p=parsePost(text), plan=planPost(p,text);
    assert.equal(plan.slides.length,6);
    for(const s of plan.slides) assert.ok((s.title+' '+s.body).split(/\s+/).length<=18);
    assert.ok(plan.caption.length<=2200);
    assert.match(plan.caption,/not medical advice/);
    assert.match(plan.caption,/Art made with AI/);
    assert.ok(p.sources.every(s=>plan.sources.includes(s.url)));
    const dir=await temp();
    try {await renderPack(plan,image,dir); assert.equal((await verifyPack(dir)).slides,6);} finally {await rm(dir,{recursive:true});}
  }
});
test('rendered packs are exact 4:5 JPEGs; email stays fixed, attaches captions, and does not duplicate',async()=>{
  const dir=await temp();
  try {
    const m=await renderPack(planPost(post,raw),image,dir);
    assert.equal(m.files.length,6);
    let calls=0;
    const fetchImpl=async(url,o)=>{
      calls++; assert.equal(url,'https://api.resend.com/emails');
      const payload=JSON.parse(o.body);
      assert.deepEqual(payload.to,[RECIPIENT]);
      assert.ok(payload.attachments.some(a=>a.filename.endsWith('caption.txt')));
      assert.equal(payload.attachments.filter(a=>a.filename.endsWith('.jpg')).length,6);
      assert.match(o.headers['Idempotency-Key'],/^carousel-[a-f0-9]{64}$/);
      assert.ok(!o.body.includes('never-log-this'));
      return Response.json({id:'test-email-id'});
    };
    const env={RESEND_API_KEY:'never-log-this'};
    assert.equal((await deliverPack(dir,{env,fetchImpl})).id,'test-email-id');
    assert.equal((await deliverPack(dir,{env,fetchImpl})).skipped,'already accepted');
    assert.equal(calls,1);
    await writeFile(path.join(dir,m.files[0]),image);
    await assert.rejects(()=>verifyPack(dir),/dimensions/);
  } finally {await rm(dir,{recursive:true});}
});
test('ambiguous network failures reuse the identical request; uncertain sends expire closed',async()=>{
  const dir=await temp();
  try {
    await renderPack(planPost(post,raw),image,dir);
    const env={RESEND_API_KEY:'fake-test-key'}, now=new Date('2026-10-26T00:00:00Z');
    let payload,key;
    await assert.rejects(()=>deliverPack(dir,{env,now,fetchImpl:async(u,o)=>{payload=o.body;key=o.headers['Idempotency-Key'];throw new Error('network');}}),/network/);
    await deliverPack(dir,{env,now,fetchImpl:async(u,o)=>{assert.equal(o.body,payload);assert.equal(o.headers['Idempotency-Key'],key);return Response.json({id:'recovered'});}});
    const receipt=await readJson(path.join(dir,'delivery.json'));
    delete receipt.id;
    await atomicJson(path.join(dir,'delivery.json'),receipt);
    await assert.rejects(()=>deliverPack(dir,{env,now:new Date('2026-10-28T00:00:00Z'),fetchImpl:()=>{throw new Error('must not call');}}),/uncertain/);
  } finally {await rm(dir,{recursive:true});}
});
test('image adapter uses subscription endpoint, handles quota/auth, and never exposes token or calls paid APIs',async()=>{
  const dir=await temp();
  try {
    const env={CODEX_HOME:dir};
    await writeFile(path.join(dir,'auth.json'),JSON.stringify({auth_mode:'chatgpt',tokens:{access_token:'fake-private-token',account_id:'fake-account'}}));
    for(const status of [401,403,429]) await assert.rejects(()=>generateVisual(planPost(post,raw),path.join(dir,'image.png'),{env,fetchImpl:async(url,o)=>{assert.equal(url,IMAGE_ENDPOINT);assert.ok(!o.body.includes('fake-private-token'));return new Response('',{status});}}),e=>e.defer===true&&!e.message.includes('fake-private-token'));
    const r=await generateVisual(planPost(post,raw),path.join(dir,'image.png'),{env,fetchImpl:async(url,o)=>{assert.equal(JSON.parse(o.body).model,'gpt-image-2');return Response.json({data:[{b64_json:image.toString('base64')}]});}});
    assert.equal(r.nativeWidth,1024);
  } finally {await rm(dir,{recursive:true});}
});
test('hourly job skips unapproved/unpublished and already accepted posts, reusing generated files',async()=>{
  const dir=await temp(), saved={...carouselDeps};
  try {
    let gens=0, sends=0;
    carouselDeps.listPosts=async()=>[{post,raw}];
    carouselDeps.published=async()=>false;
    carouselDeps.generate=async(p,file)=>{gens++;await writeFile(file,image);};
    carouselDeps.deliver=async(pack)=>{sends++;await atomicJson(path.join(pack,'delivery.json'),{id:'accepted'});return {id:'accepted'};};
    const env={CAROUSEL_ENABLED:'true',CAROUSEL_DIR:dir,RESEND_API_KEY:'fake-test-key'};
    assert.match((await run({env,log:{log(){}}})).skipped,/no new/);
    assert.equal(gens,0);
    carouselDeps.published=async()=>true;
    assert.equal((await run({env,log:{log(){}}})).sent[0].slides,6);
    assert.match((await run({env,log:{log(){}}})).skipped,/no new/);
    assert.equal(gens,1);assert.equal(sends,1);
    assert.equal((await run({env:{},log:{log(){}}})).skipped,'carousel disabled');
  } finally {Object.assign(carouselDeps,saved);await rm(dir,{recursive:true});}
});
test('literal brand text pairs meet 4.5:1',()=>{
  const luminance=hex=>{const c=hex.match(/[a-f\d]{2}/gi).map(n=>parseInt(n,16)/255).map(n=>n<=0.04045?n/12.92:((n+0.055)/1.055)**2.4);return c[0]*0.2126+c[1]*0.7152+c[2]*0.0722;};
  for(const [fg,bg] of [['paper','night'],['gold','night'],['ink','paper'],['muted','paper']]) {const a=luminance(COLORS[fg]),b=luminance(COLORS[bg]);assert.ok((Math.max(a,b)+0.05)/(Math.min(a,b)+0.05)>=4.5);}
});

test('new posts use Codex-only short copy and an independent support check before rendering',async()=>{
  const original=carouselModelDeps.completeJson;
  try {
    let calls=0;
    carouselModelDeps.completeJson=async(system,prompt,opts)=>{
      calls++;assert.equal(opts.env.LLM_PROVIDER_ORDER,'codex');assert.equal(opts.job,'carousel');
      return calls===1?{slides:planPost(post,raw).slides}:{supported:true,plain:true};
    };
    const future={...post,slug:'future-approved-post'};
    const plan=await createPlan(future,raw,{env:{LLM_PROVIDER_ORDER:'anthropic'}});
    assert.equal(plan.slides.length,6);assert.equal(calls,2);
    calls=0;
    carouselModelDeps.completeJson=async()=>++calls===1?{slides:planPost(post,raw).slides}:{supported:false};
    await assert.rejects(()=>createPlan(future,raw,{env:{}}),/manual review/);
  } finally {carouselModelDeps.completeJson=original;}
});

test('approved refreshes invalidate stale curated evidence and go back through Codex review',async()=>{
  const original=carouselModelDeps.completeJson;
  try {
    const copy=planPost(post,raw).slides;
    const changed=raw.replaceAll(copy[1].evidence,'Updated approved evidence phrase');
    const next=copy.map((s,i)=>i===1?{...s,evidence:'Updated approved evidence phrase'}:s);
    let calls=0;
    carouselModelDeps.completeJson=async()=>++calls===1?{slides:next}:{supported:true,plain:true};
    const result=await createPlan(post,changed,{env:{}});
    assert.equal(calls,2);assert.equal(result.slides[1].evidence,'Updated approved evidence phrase');
  } finally {carouselModelDeps.completeJson=original;}
});

test('one typography repair shortens an unsent cached plan without changing art or source evidence',async()=>{
  const original=carouselModelDeps.completeJson;
  try {
    const cached=planPost(post,raw);
    const saved=cached.slides.map(s=>({...s}));
    cached.slides=cached.slides.map((s,i)=>i===1?{...s,title:'A headline that has far too many words to remain elegant and scannable'}:s);
    let calls=0;
    carouselModelDeps.completeJson=async()=>++calls===1?{slides:saved.map(({title,body})=>({title,body}))}:{supported:true,plain:true};
    const fixed=await prepareCachedPlan(post,raw,cached,{env:{}});
    assert.equal(calls,2);assert.deepEqual(fixed.slides,saved);
    calls=0;
    carouselModelDeps.completeJson=async()=>{calls++;return {slides:cached.slides};};
    await assert.rejects(()=>prepareCachedPlan(post,raw,cached,{env:{}}),/scannable/);
    assert.equal(calls,1,'only one shortening attempt is allowed');
  } finally {carouselModelDeps.completeJson=original;}
});
