import path from 'node:path';
import { mkdir, readFile, access, copyFile } from 'node:fs/promises';
import { gh } from '../github.js';
import { parsePost } from '../frontmatter.js';
import { createPlan, prepareCachedPlan, validatePost, digest, VERSION, atomicJson, renderPack, verifyPack, deliverPack, readJson } from '../carousel.js';
import { generateVisual } from '../carousel-image.js';

// Explicit seam for offline tests; never accepts executable paths or commands from a post.
export const carouselDeps={listPosts:null,generate:generateVisual,render:renderPack,deliver:deliverPack,published:null};
export async function publishedPosts({env=process.env,fetchImpl=fetch}={}) {
  const repo=env.GITHUB_REPO||'Gahroot/mom317';
  if(!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) throw new Error('Invalid GitHub repo');
  const entries=await gh('GET',`/repos/${repo}/contents/content/posts?ref=main`,null,env);
  const out=[];
  for(const e of entries) {
    if(e.type!=='file'||!/^[-a-z0-9]+\.md$/.test(e.name)) continue;
    const data=await gh('GET',`/repos/${repo}/contents/content/posts/${e.name}?ref=main`,null,env);
    const raw=Buffer.from(data.content,'base64').toString('utf8');
    const post=parsePost(raw);
    if(post.status==='approved') out.push({post,raw});
  }
  return out.sort((a,b)=>String(a.post.date).localeCompare(String(b.post.date))||a.post.slug.localeCompare(b.post.slug));
}
export async function run({db,env=process.env,log=console}) {
  if(env.CAROUSEL_ENABLED!=='true') return {skipped:'carousel disabled'};
  if(!env.RESEND_API_KEY||(!env.GITHUB_TOKEN&&!carouselDeps.listPosts)) return {skipped:'carousel credentials missing'};
  const root=path.resolve(env.CAROUSEL_DIR||'/data/carousels');
  await mkdir(root,{recursive:true,mode:0o700});
  const posts=await (carouselDeps.listPosts||publishedPosts)({env});
  const results=[];
  const limit=Math.min(3,Math.max(1,Number(env.CAROUSEL_MAX_PER_RUN)||1));
  for(const {post,raw} of posts) {
    validatePost(post);
    const fingerprint=digest(VERSION+'\n'+raw);
    const dir=path.join(root,post.slug,fingerprint.slice(0,16));
    const url=`https://back2sleepnow.com/blog/${post.slug}`;
    const delivered=await readJson(path.join(dir,'delivery.json'));
    if(delivered?.id) continue;
    // A main-branch approval is insufficient: confirm the built page is actually live.
    const published=carouselDeps.published?await carouselDeps.published(url):await fetch(url,{method:'GET',redirect:'error',signal:AbortSignal.timeout(30000)}).then(r=>r.ok);
    if(!published) {log.log(`[carousel] not live yet: ${post.slug}`); continue;}
    await mkdir(dir,{recursive:true,mode:0o700});
    const cached=await readJson(path.join(dir,'plan.json'));
    const plan=cached?await prepareCachedPlan(post,raw,cached,{env,db}):await createPlan(post,raw,{env,db});
    if(plan.fingerprint!==fingerprint)throw new Error('Carousel plan cache mismatch');
    await atomicJson(path.join(dir,'plan.json'),plan);
    const image=path.join(dir,'visual.png');
    try{await access(image);}
    catch{
      const prior=path.join(root,plan.slug,digest('marian-editorial-2'+'\n'+raw).slice(0,16),'visual.png');
      try{await copyFile(prior,image);log.log(`[carousel] reused subscription artwork for ${plan.slug}`);}
      catch(e){if(e.code!=='ENOENT')throw e;await carouselDeps.generate(plan,image,{env,db});}
    }
    const existing=await readJson(path.join(dir,'manifest.json'));
    if(!existing||JSON.stringify(existing.slides)!==JSON.stringify(plan.slides)) await carouselDeps.render(plan,await readFile(image),dir);
    await verifyPack(dir);
    const receipt=await carouselDeps.deliver(dir,{env});
    results.push({slug:plan.slug,emailId:receipt.id,slides:plan.slides.length});
    log.log(`[carousel] accepted by Resend: ${plan.slug} (${receipt.id})`);
    if(results.length>=limit) break;
  }
  return results.length?{sent:results}:{skipped:'no new approved live posts'};
}
