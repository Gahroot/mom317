// A small, dependency-free guard. Grade is an estimate, not a reading-level certificate.
export const wordCount=s=>(String(s).match(/[A-Za-z]+(?:['’][A-Za-z]+)?|\d+/g)||[]).length;
const jargon=/\b(clinicians?|pharmacists?|insomnia|chronic|multicomponent|cognitive|behaviou?ral|vasomotor|perimenopaus\w*|hyperarousal|symptoms?|supplements?|interventions?|efficacy|therapeutic|prevalence|associated|transition|nonhormon\w*|CBT[-‑–]?I|AASM|NHS|GP|SSRIs?|SNRIs?)\b/i;
export function readingGrade(text){
  const clean=String(text).replace(/https?:\/\/\S+/g,'').replace(/#[A-Za-z0-9_]+/g,'').replace(/Marian Grout|3:17/gi,'');
  const words=clean.toLowerCase().match(/[a-z]+(?:['’][a-z]+)?/g)||[];
  if(!words.length)return 0;
  const sentences=Math.max(1,(clean.match(/[.!?]+(?:\s|$)/g)||[]).length);
  let syllables=0;
  const known={people:2,every:2,your:1,our:1,doctor:2,doctors:2,women:2,menopause:3,quiet:2,awake:2,sleepy:2,choices:2,minutes:2,linked:1,advice:2};
  for(let w of words){
    w=w.replace(/['’]/g,'');
    if(known[w]){syllables+=known[w];continue;}
    let n=(w.match(/[aeiouy]+/g)||[]).length;
    if(w.length>3&&/e$/.test(w)&&!/[bcdfghjklmnpqrstvwxz]le$/.test(w))n--;
    if(w.length>4&&/[^td]ed$/.test(w))n--;
    syllables+=Math.max(1,n);
  }
  return Math.max(0,0.39*words.length/sentences+11.8*syllables/words.length-15.59);
}
export function checkPlainLanguage(slides,caption=''){
  for(const s of slides){
    if(wordCount(s.title)>6||wordCount(s.body)>12||wordCount(s.title+' '+s.body)>18)throw new Error('Scannable plain copy needs fewer words');
    const hit=(s.title+' '+s.body).match(jargon);
    if(hit)throw new Error(`Plain language needed instead of ${hit[0]}`);
  }
  const combined=slides.map(s=>s.title+'. '+s.body).join('\n');
  if(readingGrade(combined)>5)throw new Error('Plain language grade estimate exceeds5');
  if(caption){
    if(jargon.test(caption.replace(/https?:\/\/\S+/g,'')))throw new Error('Plain caption still contains jargon');
    if(readingGrade(caption)>5)throw new Error('Plain caption grade estimate exceeds5');
  }
}
