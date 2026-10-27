// Licensed font outlines avoid host font fallback and keep exports identical on macOS/Linux.
import { readFileSync } from 'node:fs';
import sharp from 'sharp';
const fonts={display:JSON.parse(readFileSync(new URL('../assets/fonts/CormorantGaramond-paths.json',import.meta.url))),body:JSON.parse(readFileSync(new URL('../assets/fonts/Figtree-paths.json',import.meta.url)))};
export async function typeset(text,{display=false,size=48,width=900,color='#2B1E16',maxHeight=800,minimum=display?64:40}={}) {
  const f=fonts[display?'display':'body'];
  for(let n=size;n>=minimum;n-=2) {
    const scale=n/f.units, lineHeight=n*(display?1.06:1.28), lines=[];
    const measure=s=>[...s].reduce((sum,c)=>sum+(f.chars[c]?.advance||f.chars['?'].advance)*scale,0);
    let line='';
    for(const word of String(text).split(/\s+/)) {
      if(measure(word)>width) throw new Error('Unbreakable text exceeds slide width');
      if(line && measure(line+' '+word)>width){lines.push(line);line=word;} else line+=(line?' ':'')+word;
    }
    if(line)lines.push(line);
    const height=Math.ceil(lines.length*lineHeight+n*0.12);
    if(height>maxHeight)continue;
    let paths='';
    for(let i=0;i<lines.length;i++) {
      let x=0;
      for(const c of lines[i]) {
        const g=f.chars[c];
        if(!g) throw new Error('Unsupported character in slide typography');
        if(g.d) paths+=`<path d="${g.d}" transform="translate(${x.toFixed(2)} ${(n*0.87+i*lineHeight).toFixed(2)}) scale(${scale} ${-scale})"/>`;
        x+=g.advance*scale;
      }
    }
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><g fill="${color}">${paths}</g></svg>`;
    return {input:await sharp(Buffer.from(svg)).png().toBuffer(),height,size:n,lines:lines.length};
  }
  throw new Error('Text does not fit at the minimum readable size');
}
