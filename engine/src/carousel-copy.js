// Plain-language editorial briefs. Exact source quotes stay in the research notes, not the slides.
const COPY={
 'why-wake-3am-menopause':[
  ['Awake at 3 a.m.?','A broken night can feel long.',[],[],'one ivory paper crescent and a folded linen cushion'],
  ['Sleep can change.','You may find it harder to stay asleep near menopause.',['1'],['The menopause transition is associated with more insomnia symptoms, especially difficulty staying asleep.','Night waking is one of the most common sleep complaints in menopause.'],'two gently layered ivory paper shapes'],
  ['Hot flashes and sleep.','One small study linked some hot flashes with waking.',['2'],['In one study of 34 perimenopausal women, 69.4% of recorded hot flushes were associated with an awakening.','about 69% of measured hot flushes came with an awakening'],'one warm amber paper wave beside an ivory fold'],
  ['Why at 3 a.m.?','The studies don’t explain that exact time.',['1'],['The evidence described above does not give me an answer to that exact clock-time question. I would not stretch it into one.'],'an open paper ring with a small gap'],
  ['When should you get help?','If poor sleep makes daily life hard, talk to a doctor.',['7'],['The NHS advises seeing a GP if sleep-habit changes have not helped, problems have lasted months, or insomnia makes daily life hard to cope with.',"Common doesn't mean you have to put up with it"],'two simple ivory paper arches facing each other'],
  ['Save. Read. Share.','Take your sleep questions to a doctor.',[],[],'a small open paper book with blank pages']
 ],
 'cant-get-back-to-sleep-menopause':[
  ['Wide awake again?','Let’s keep the next step small.',[],[],'one ivory paper moon beside a soft linen fold'],
  ['Awake for about 20 minutes?','Try getting up for a calm break.',['1'],['The NHS suggests getting up after around 20 minutes awake, doing something relaxing somewhere comfortable, and returning to bed when sleepy.',"if you're still awake after around 20 minutes"],'a small empty paper armchair beside a warm lamp'],
  ['Go back when sleepy.','There’s no need to force sleep.',['1'],['returning to bed when sleepy','go back to bed when you feel sleepy'],'three gently joined paper arches'],
  ['Habits may not be enough.','For sleep trouble that lasts, ask a doctor for more help.',['2'],['The AASM conditionally recommends against sleep hygiene as the sole therapy for chronic insomnia disorder in adults.',"sleep hygiene shouldn't be used alone to treat chronic insomnia"],'a loose ivory paper weave'],
  ['When should you get help?','If poor sleep makes daily life hard, talk to a doctor.',['4'],['insomnia makes daily life hard to cope with','if it is making daily life hard'],'two soft paper shapes resting side by side'],
  ['Save this for tonight.','Read more when you feel ready.',[],[],'a closed paper book with a warm amber ribbon']
 ],
 'night-sweats-waking-me-up-every-night-options':[
  ['Waking up hot again?','You have choices. Let’s keep them clear.',[],[],'rumpled ivory linen with one warm paper moon'],
  ['Keep a note.','Write down when the sweats wake you.',['3'],['keeping a diary of your nights'],'an open paper notebook with simple moon shapes'],
  ['Ask about other choices.','There may be more than one way to help.',['2'],["I'd talk through with a clinician which, if any, fits my situation."],'two gently branching amber paper paths'],
  ['Your health comes first.','Ask a doctor to help you weigh the risks.',['1'],['risks of hormone therapy differ depending on type, dose, duration'],'a few smooth balanced paper pebbles'],
  ['New sleep aid?','Ask a doctor before you try it.',['2'],["I'd check with a clinician or pharmacist before starting any supplement"],'an empty clear glass with a soft amber shadow'],
  ['Save this for your visit.','Take your notes and questions to a doctor.',[],[],'an open blank notebook below a small paper sun']
 ],
 'racing-thoughts-at-night-menopause-cant-switch-off':[
  ['Mind still busy at night?','Let’s take it one small step at a time.',[],[],'a paper moon beside one loose ribbon curl'],
  ['Don’t guess the cause.','Ask a doctor to help you understand what’s going on.',['7'],['I would ask a clinician to assess what you are experiencing rather than diagnose yourself from a symptom list.'],'two simple paper shapes facing each other'],
  ['Write your worries down.','Try 10 to 15 minutes early in the evening.',['5'],['The NHS suggests setting aside 10 to 15 minutes to write down worries and explore solutions.'],'a small open blank notebook with one soft paper pencil'],
  ['Still awake in bed?','Ask a doctor about getting up and coming back when sleepy.',['6'],["NHLBI's description of stimulus control includes getting out of bed if you cannot sleep and going to bed only when sleepy."],'a quiet paper armchair with a small warm lamp'],
  ['Ask for help.','If worry or sadness makes life hard, talk to a doctor.',['8'],['The NHS advises seeing a GP for low mood lasting more than two weeks or when you are struggling to cope.'],'two soft overlapping paper forms'],
  ['Keep this for later.','Your sleep matters. Bring your questions to a doctor.',[],[],'a small blank paper book and a warm rising sun']
 ]
};
const normalize=s=>String(s).replace(/[‘’]/g,"'").replace(/[“”]/g,'"').replace(/\s+/g,' ');
export function curatedCopy(slug,raw=''){
 const rows=COPY[slug];if(!rows)return undefined;
 const text=normalize(raw);
 const result=rows.map(([title,body,sourceIds,quotes,art],i)=>({kind:i===0?'cover':i===5?'close':'point',title,body,sourceIds,evidence:quotes.find(q=>text.includes(normalize(q)))||quotes[0]||'',art}));
 // The older approved test post had a different fourth point. Never use a removed claim in a refresh.
 if(slug==='why-wake-3am-menopause'&&!text.includes('exact clock-time question')&&text.includes('a full bladder, low mood'))result[3]={kind:'point',title:'Other things can play a part.',body:'A full bladder or low mood may also affect sleep.',sourceIds:['1'],evidence:'a full bladder, low mood, anxiety and sleep apnoea can also play a part',art:'three smooth paper pebbles around a small moon'};
 return result;
}
