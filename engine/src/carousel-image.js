// Same Codex image endpoint and request shape as EZ Coder's generate_image tool.
// Subscription only. Read this machine's existing login in memory; never copy it.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { codexHome, getState, setState } from './codex.js';
import { DeferError } from './mode.js';
import { recordUsage } from './cost.js';

export const IMAGE_ENDPOINT='https://chatgpt.com/backend-api/codex/images/generations';
export function imagePrompt(plan) {
  const places=['top left','top right','middle left','middle right','bottom left','bottom right'];
  const scenes=plan.slides.map((s,i)=>`Panel ${i+1} (${places[i]}): ${s.art}.`).join('\n');
  return `Create one image containing an EXACT even 2-column by 3-row grid of SIX independent elegant editorial still-life illustrations, no gutters, borders or dividers. Every scene is centered and fits completely in its equal cell with plentiful negative space. Identical warm parchment background (#F7F1E6). Fine-art paper-cut sculpture, matte cream linen forms, muted sand, deep brown ink details, restrained amber accents, soft natural shadows, subtle tactile grain. Minimal and sophisticated, not a busy collage, cartoon icons or glossy stock photography. Single focal composition per cell. NO TEXT, letters, numbers, logos, people, faces, products, medicines or bottles. For Marian Grout, founder of 3:17. Each cell will become a different carousel slide.\n${scenes}`;
}
export async function generateVisual(post,file,{env=process.env,db,fetchImpl=fetch,sleep=(ms)=>new Promise(r=>setTimeout(r,ms)),now=new Date()}={}) {
  const until=await getState(db,'carousel_image_backoff');
  if(until && new Date(until)>now) throw new DeferError(`Codex image limit; waiting until ${until}`);
  let auth;
  try {auth=JSON.parse(await readFile(path.join(codexHome(env),'auth.json'),'utf8'));} catch {throw new DeferError('Codex image login missing; renew the server Codex login');}
  if(auth.auth_mode!=='chatgpt'||!auth.tokens?.access_token) throw new DeferError('Codex image generation requires the existing ChatGPT subscription login');
  const version='0.161.0'; // Same client identity as EZ Coder image tool, verified 26 Oct 2026.
  const headers={Authorization:`Bearer ${auth.tokens.access_token}`,'Content-Type':'application/json',Accept:'application/json',originator:'codex_cli_rs',version,'User-Agent':`codex_cli_rs/${version} (${os.type()} ${os.release()}; ${os.arch()})`,'x-codex-image-turn-id':randomUUID(),...(auth.tokens.account_id?{'chatgpt-account-id':auth.tokens.account_id}:{})};
  const body=JSON.stringify({prompt:imagePrompt(post),model:'gpt-image-2',quality:'high',size:'1024x1280',background:'opaque'});
  let response;
  for(let attempt=0;attempt<3;attempt++) {
    response=await fetchImpl(IMAGE_ENDPOINT,{method:'POST',headers,body,signal:AbortSignal.timeout(600000)});
    if(response.status<500 || attempt===2) break;
    await sleep(1000*2**attempt);
  }
  if([401,403].includes(response.status)) throw new DeferError(`Codex image access refused (${response.status}); renew/check this server's subscription login`);
  if(response.status===429) {
    // Never hammer shared subscription quota, and never fall back to a paid API.
    const until=new Date(now.getTime()+24*3600000).toISOString();
    await setState(db,'carousel_image_backoff',until);
    throw new DeferError(`Codex image quota reached; paused until ${until}`);
  }
  if(!response.ok) throw Object.assign(new Error(`Codex image HTTP ${response.status}; response body omitted`),{retryable:response.status>=500});
  const j=await response.json();
  const b64=j.data?.[0]?.b64_json;
  if(typeof b64!=='string'||b64.length>40_000_000) throw new Error('Codex image response missing or too large');
  const png=Buffer.from(b64,'base64');
  const meta=await sharp(png,{limitInputPixels:20_000_000}).metadata();
  if(meta.format!=='png'||!meta.width||!meta.height) throw new Error('Codex image response was not a measurable PNG');
  await writeFile(file,png,{mode:0o600});
  await recordUsage(db,{job:'carousel',provider:'codex',model:'gpt-image-2',usd:0},{env});
  return {nativeWidth:meta.width,nativeHeight:meta.height,requested:'1024x1280'};
}
