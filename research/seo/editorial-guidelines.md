# Back2SleepNow.com editorial guidelines (for humans and the drafting agent)

Format: every post follows `CONTRACT.md` §1 exactly. Drafts are always `status: draft` with `approved_by:` empty. Only a human approves.

## Reader and voice
- **Reader:** a woman in peri- or post-menopause who wakes in the night and can't get back to sleep. She is often reading on her phone at 3 a.m. Write for her, not for clinicians or men or "everyone who sleeps badly".
- **Byline:** Marian Grout, founder. The only biographical fact is that she is "a woman who spent 15 years awake at 3 a.m." Never invent anything else: no age, family, job, diagnosis, treatments she tried, or credentials. Never imply she is a clinician.
- **Tone:** warm, calm, plain-spoken, a little dry. First person ("I", "we") is fine. Short sentences and short paragraphs. UK/US-neutral; say "hot flushes/hot flashes" consistently within a post.
- **Non-alarmist:** no fear hooks ("this silent killer…"), no shaming, no "fix it in 3 days". Validate the reader, then give her something to do.
- **Structure:** H1 = the question. The 40-60 word `answer` must stand alone as an AI-quotable reply. Use question-style H2s that match how people search. Give practical steps in lists. End with "When should I see a doctor?", a short summary and the italic not-medical-advice line. Length 1,500-2,200 words; 4-6 FAQs.

## Evidence standard
- Every factual or medical statement carries a `[^n]` that matches a `sources` id. No citation, no claim.
- Source preference: (1) systematic reviews, RCTs and guidelines via doi.org / PubMed / PMC; (2) The Menopause Society, AASM, ACOG, NIH/NIA, NHS, Sleep Foundation. Never cite brand blogs, competitors, Wikipedia, social posts or AI output as evidence.
- Open every URL before using it and check that the page says what you claim (it must load and match). Prefer the PMC full text or the DOI. Note: NIH, JAMA and some publisher pages block scripts (403/405), so use the PubMed/PMC URL instead.
- Report numbers exactly as the source does, with context (study size, population). Say "in one study" when it's one study. Name uncertainty ("we haven't found good evidence that…").
- Every medical claim goes in `claims` with its source id, written as the human reviewer should check it.
- Don't repeat popular unsupported mechanisms (cortisol spike at 3 a.m., blood-sugar crash, "adrenal fatigue", liver meridian times) as fact.

## Claims: allowed vs forbidden
3:17 will be sold as a supplement, so FTC (truthful, substantiated advertising) and FDA (DSHEA structure/function vs disease claims) rules apply to the whole site, blog included. Content placed next to a product can be read as labelling.

**Allowed**
- Educational, cited statements about menopause, sleep and treatments (CBT-I, HRT, prescription non-hormone options), framed as "talk to your doctor".
- Neutral, cited evidence summaries for any ingredient class, **only on pages that don't mention 3:17**, including where the evidence is weak or negative.
- 3:17 described only as: "We're making a middle of the night sleep shot for women in menopause" plus an invitation to join the waitlist.

**Forbidden**
- Any efficacy, outcome or comparison claim about 3:17 ("helps you fall back asleep", "works in 15 minutes", "clinically proven", "better than melatonin").
- Naming 3:17's ingredients, dose, mg amounts or formula, or hinting at them ("our magnesium blend").
- Disease claims for any supplement: treats, cures, prevents insomnia, menopause or hot flushes.
- Calling the product a "liquid dietary supplement". Never call it a medicine or a treatment.
- Invented testimonials, signup counts, waitlist positions, reviewer names, stats or quotes. Ship dates and prices only from `site/config.js` or the owner.
- Telling readers to start, stop or change any medication or HRT. Say "discuss with your clinician".
- Diagnosing the reader ("you have sleep apnoea").

## Citation rules
- Footnote markers go right after the claim, before the full stop where natural: `…an awakening[^2].`
- Each `sources` entry needs id, full title (authors for papers), publisher/journal, year and a working URL (DOI or PMC preferred). Every id must be cited in the body, and every marker must exist in `sources`.
- 5-10 sources per post. One claim may reuse a source; don't pad.
- Quote at most a short phrase; paraphrase otherwise.

## CTA rules
- The template adds the signup forms. Write **at most one** soft in-text mention, after the reader has got real value (usually after "What can help?"). Use the wording above, followed by "None of the advice here depends on it" or similar.
- No urgency or scarcity language, no "limited spots", and no CTA inside medical-advice sections.
- Qualify by content: write for night-waking menopausal women so the right readers sign up. Don't broaden topics just for traffic.

## Links
- Link to the cluster's pillar in the first ~150 words, plus one sibling post (see `strategy.md` §5). Use descriptive anchors. Only link to posts that exist or are approved in the same PR.

## Automated approval gate

The owner chose to publish without human review. Every engine PR (new post or refresh) must pass four checks before it is approved and merged: all sources resolve; `tools/build-blog.mjs --check` passes; the claims lint finds no product efficacy, ingredient/dose, "liquid dietary supplement", signup-count or testimonial language; and an independent skeptical fact-check rates every listed claim `supported` against its source's text and finds no medical statement missing from `claims`. Anything else is held with a `needs-review` label and an issue for the owner, who can override with `/approve`. So list every medical statement in `claims` and cite sources whose title or abstract states it directly. `AUTO_PUBLISH=false` brings back human approval.

## Before handing over a draft
Answer is 40-60 words · description is 150-160 characters · slug = filename · all markers resolve · every URL opened · every medical sentence is in `claims` · no forbidden claim · one soft mention at most · ends with the see-a-doctor section and disclaimer.
