import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {readingGrade,checkPlainLanguage,wordCount} from '../src/plain-language.js';
import {parsePost} from '../src/frontmatter.js';
import {planPost,digest,atomicJson,createPlan,carouselModelDeps} from '../src/carousel.js';
import {run,carouselDeps} from '../src/jobs/carousel.js';
const raw=await readFile(new URL('../../content/posts/why-wake-3am-menopause.md',import.meta.url),'utf8');
const post=parsePost(raw);

test('plain language guard rejects jargon, long slide copy and high estimated reading grade',()=>{
 assert.ok(readingGrade('A broken night can feel long. Ask a doctor for help.')<=5);
 assert.throws(()=>checkPlainLanguage([{title:'Sleep help.',body:'Ask a clinician about chronic insomnia.'}]),/Plain language/);
 assert.throws(()=>checkPlainLanguage([{title:'Sleep help.',body:'one '.repeat(20)}]),/Scannable/);
 assert.ok(readingGrade('Institutionalized methodologies necessitate comprehensive physiological evaluations.')>5);
});
test('current public copy stays brief and simple, with formal source titles outside the caption',()=>{
 const p=planPost(post,raw);
 checkPlainLanguage(p.slides,p.caption);
 assert.ok(p.slides.every(s=>wordCount(s.title)<=6&&wordCount(s.body)<=12&&wordCount(s.title+' '+s.body)<=18));
 assert.ok(readingGrade(p.caption)<=5);
 assert.ok(!p.caption.includes('Journal of'));
 assert.ok(p.sources.includes(post.sources[0].title));
});
test('a reading-level rejection cannot pass just because the medical summary is supported',async()=>{
 const original=carouselModelDeps.completeJson;
 try{
  let n=0;
  carouselModelDeps.completeJson=async()=>++n===1?{slides:planPost(post,raw).slides}:{supported:true,plain:false};
  await assert.rejects(()=>createPlan({...post,slug:'new-plain-post'},raw,{env:{}}),/Plain language/);
 }finally{carouselModelDeps.completeJson=original;}
});
test('a copy-only revision reuses Codex artwork for the same source, without another image call',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'carousel-reuse-')),saved={...carouselDeps};
 try{
  const prior=path.join(root,post.slug,digest('marian-editorial-2'+'\n'+raw).slice(0,16));
  await mkdir(prior,{recursive:true});
  const png=await sharp({create:{width:256,height:384,channels:3,background:'#E6D7BE'}}).png().toBuffer();
  await writeFile(path.join(prior,'visual.png'),png);
  carouselDeps.listPosts=async()=>[{post,raw}];carouselDeps.published=async()=>true;
  carouselDeps.generate=async()=>{throw new Error('Must reuse the existing art');};
  carouselDeps.deliver=async(dir)=>{await atomicJson(path.join(dir,'delivery.json'),{id:'plain-copy-email'});return {id:'plain-copy-email'};};
  const r=await run({env:{CAROUSEL_ENABLED:'true',CAROUSEL_DIR:root,RESEND_API_KEY:'test-only'},log:{log(){}}});
  assert.equal(r.sent[0].slides,6);
 }finally{Object.assign(carouselDeps,saved);await rm(root,{recursive:true});}
});
