#!/usr/bin/env python3
"""Build the Sleep Shot waitlist/pre-order directions deck (PDF) from research screens."""

from PIL import Image, ImageDraw, ImageFont

SCREENS = "/Users/groot/mom317/research/screens"
OUT = "/Users/groot/mom317/Sleep-Shot-Waitlist-Directions.pdf"

# ---------- canvas ----------
W, H = 1650, 1275  # US Letter landscape @ 150dpi
M = 80

NAVY = (22, 35, 60)
CREAM = (250, 246, 239)
SAND = (239, 230, 216)
TERRA = (194, 98, 47)
INK = (32, 40, 56)
GRAY = (112, 120, 132)
LINE = (214, 205, 190)

# ---------- fonts ----------
F = "/System/Library/Fonts/Supplemental"
def serif(size, bold=False):
    p = f"{F}/Georgia Bold.ttf" if bold else f"{F}/Georgia.ttf"
    return ImageFont.truetype(p, size)
def sans(size, bold=False):
    p = f"{F}/Arial Bold.ttf" if bold else f"{F}/Arial.ttf"
    return ImageFont.truetype(p, size)
def ital(size):
    return ImageFont.truetype(f"{F}/Arial Italic.ttf", size)

# ---------- helpers ----------
def wrap(draw, text, font, max_w):
    words, lines, cur = text.split(), [], ""
    for w in words:
        t = (cur + " " + w).strip()
        if draw.textlength(t, font=font) <= max_w:
            cur = t
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines

def para(draw, text, font, x, y, max_w, lh, color=INK):
    for ln in wrap(draw, text, font, max_w):
        draw.text((x, y), ln, font=font, fill=color)
        y += lh
    return y

def bullets(draw, items, font, x, y, max_w, lh, color=INK, gap=14, marker="—", mcolor=TERRA):
    for it in items:
        draw.text((x, y), marker, font=font, fill=mcolor)
        lines = wrap(draw, it, font, max_w - 46)
        yy = y
        for i, ln in enumerate(lines):
            draw.text((x + 46, yy), ln, font=font, fill=color)
            yy += lh
        y = yy + gap
    return y

def kicker(draw, text, x, y, color=TERRA):
    f = sans(21, bold=True)
    cx = x
    for ch in text.upper():
        draw.text((cx, y), ch, font=f, fill=color)
        cx += draw.textlength(ch, font=f) + 4
    return y + 34

def header(draw, kick, title, sub=None):
    y = 62
    y = kicker(draw, kick, M, y)
    y = para(draw, title, serif(46, bold=True), M, y, W - 2 * M, 58, NAVY)
    if sub:
        y += 6
        y = para(draw, sub, ital(26), M, y, W - 2 * M, 36, GRAY)
    return y

def footer(draw, n):
    draw.line((M, H - 62, W - M, H - 62), fill=LINE, width=2)
    f = sans(19)
    draw.text((M, H - 50), "Sleep Shot · Waitlist & Pre-Order Landing Page Directions", font=f, fill=GRAY)
    t = f"Page {n}"
    draw.text((W - M - draw.textlength(t, font=f), H - 50), t, font=f, fill=GRAY)

def fit(img_path, box_w, box_h):
    im = Image.open(img_path).convert("RGB")
    r = min(box_w / im.width, box_h / im.height)
    return im.resize((int(im.width * r), int(im.height * r)), Image.LANCZOS)

def frame(draw, x, y, w, h, title, src, caption=None):
    """Draw an image contain-fit inside (x,y,w,h) with a thin frame."""
    draw.rectangle((x, y, x + w, y + h), fill=(255, 255, 255), outline=LINE, width=2)
    if title:
        draw.text((x + 16, y + 12), title, font=sans(20, bold=True), fill=NAVY)
        y += 44
        h -= 44
    im = fit(src, w - 32, h - 32)
    ix = x + (w - im.width) // 2
    iy = y + (h - im.height) // 2
    draw._image.paste(im, (ix, iy))
    if caption:
        draw.text((x + 16, y + h + 6), caption, font=sans(19), fill=GRAY)

def new_page(bg=CREAM):
    im = Image.new("RGB", (W, H), bg)
    return im, ImageDraw.Draw(im)

pages = []

# ============ 1. COVER ============
im, d = new_page(NAVY)
d.rectangle((M, 300, M + 220, 310), fill=TERRA)
kicker(d, "Design research · September 2026", M, 340, SAND)
para(d, "The Sleep Shot", serif(96, bold=True), M, 392, W - 2 * M, 110, CREAM)
para(d, "Waitlist & pre-order landing page directions", serif(44), M, 530, W - 2 * M, 58, SAND)
para(d, "A visual research deck: the most successful supplement waitlist pages, the "
        "competitive white space, and five design directions to choose from.",
     ital(28), M, 640, 1050, 42, CREAM)
d.line((M, 900, W - M, 900), fill=(70, 86, 112), width=2)
para(d, "Prepared for Mom  ·  Product: a sleep shot that helps you fall back asleep "
        "when you wake in the middle of the night  ·  Audience: post-menopausal women "
        "and other people with night-time sleep issues",
     sans(22), M, 930, W - 2 * M, 34, SAND)
pages.append(im)

# ============ 2. THE BRIEF ============
im, d = new_page()
y = header(d, "The brief", "What we are building, and for whom",
           "One page that turns a 3 a.m. sufferer into a waitlist signup — and maybe a first-batch pre-order.")
y += 30
cols = [
    ("THE PRODUCT", [
        "A small liquid sleep shot taken in the middle of the night, when you wake up and cannot get back to sleep.",
        "Fast, drinkable, no water needed, no morning grogginess, non-habit-forming.",
    ]),
    ("THE AUDIENCE", [
        "Post-menopausal women first — the group whose sleep is most fragmented and most underserved.",
        "Also: anyone with 3 a.m. waking (shift workers, anxious minds, new parents — later).",
    ]),
    ("THE GOAL OF THE PAGE", [
        "Collect emails for the waitlist (primary).",
        "Optionally take refundable pre-order deposits for the first batch (secondary).",
        "Give Mom five clear visual directions to choose from.",
    ]),
]
cw = (W - 2 * M - 60) // 3
for i, (t, items) in enumerate(cols):
    x = M + i * (cw + 30)
    d.rectangle((x, y, x + cw, y + 470), fill=(255, 255, 255), outline=LINE, width=2)
    d.rectangle((x, y, x + cw, y + 8), fill=TERRA)
    kicker(d, t, x + 24, y + 34)
    bullets(d, items, sans(23), x + 24, y + 90, cw - 48, 34, gap=18)
y += 520
para(d, "How to use this deck", serif(32, bold=True), M, y, W - 2 * M, 42, NAVY)
para(d, "Pages 3–6: what the research says. Pages 7–12: five visual directions with real screens — "
        "this is the part to react to. Pages 13–14: waitlist mechanics and category context. "
        "Pages 15–19: our recommendation, page blueprint, copy starters, and a simple checklist "
        "to pick a direction.", sans(23), M, y + 56, W - 2 * M, 34, INK)
footer(d, 2)
pages.append(im)

# ============ 3. THREE BIG IDEAS ============
im, d = new_page()
y = header(d, "Executive summary", "Three ideas that decide this page")
y += 30
ideas = [
    ("1", "Nobody owns the 3 a.m. rescue",
     "Bedtime products (Beam, Feals) and nightly-prevention products (Bonafide Noctera) are crowded. "
     "\"I woke at 3 a.m. — take a shot, get back to sleep\" is a proven phrase in cheap retail (MidNite, "
     "Nature Made) but unclaimed as a premium brand. That is our position."),
    ("2", "Proof converts, not vibes",
     "The best supplement pages lead with numbers and specifics: \"88% of women improved in 3 weeks\", "
     "ingredient milligrams, named doctors, real midlife women's stories. Vague wellness language is the "
     "enemy. Answer safety early: melatonin-free, non-habit-forming, no grogginess."),
    ("3", "Waitlist mechanics are worth more than polish",
     "Average waitlist pages convert 2–5% of visitors; good ones 8–20%; the best 25%+. The difference is "
     "mechanics: one outcome headline, one email field, proof beside the form, a share-to-move-up reward "
     "after signup, and nothing else on the page."),
]
for num, t, body in ideas:
    d.rectangle((M, y, W - M, y + 260), fill=(255, 255, 255), outline=LINE, width=2)
    d.rectangle((M, y, M + 10, y + 260), fill=TERRA)
    d.text((M + 44, y + 34), num, font=serif(64, bold=True), fill=TERRA)
    d.text((M + 130, y + 40), t, font=serif(34, bold=True), fill=NAVY)
    para(d, body, sans(23), M + 130, y + 100, W - 2 * M - 200, 34, INK)
    y += 290
footer(d, 3)
pages.append(im)

# ============ 4. WAITLIST SCIENCE ============
im, d = new_page()
y = header(d, "Research · waitlist pages", "What the most successful waitlists do")
y += 24
d.rectangle((M, y, W - M, y + 120), fill=SAND)
for i, (big, small) in enumerate([("2–5%", "average visitor→signup"), ("8–20%", "good pages"),
                                  ("25%+", "elite pages"), ("+10–15%", "just by removing nav")]):
    x = M + 40 + i * ((W - 2 * M - 80) // 4)
    d.text((x, y + 18), big, font=serif(44, bold=True), fill=NAVY)
    d.text((x, y + 74), small, font=sans(21), fill=INK)
y += 156
d.text((M, y), "The five-part anatomy of every page converting above 10%", font=serif(30, bold=True), fill=NAVY)
y += 52
anat = [
    "Outcome headline — the specific result (\"get back to sleep at 3 a.m.\"), never the category (\"better sleep\").",
    "One CTA, one field — email only, above the fold. Every extra field costs signups.",
    "Proof beside the form — a live count (\"1,247 women joined\"), a doctor quote, or the product itself.",
    "Reward on the confirmation screen — \"You're #182 in line; move up 10 spots for every friend\" (the Robinhood/Dropbox mechanic).",
    "Mobile-first, zero distraction — most traffic taps in from social on a phone.",
]
y = bullets(d, anat, sans(23), M, y, W - 2 * M, 34, gap=16)
y += 10
d.text((M, y), "Case mechanics worth stealing", font=serif(30, bold=True), fill=NAVY)
y += 52
cases = [
    "Robinhood: visible position in line → ~1M signups before launch. Dropbox: refer-a-friend → 100K to 4M users.",
    "Superhuman: scarcity/qualification (\"we'll call you\") made the list feel like a club — great fit for a premium product.",
    "Notion: email-only page converted 50%+ of warm traffic — minimal wins when people already trust you.",
    "Frequent mistakes: generic headlines (\"join our waitlist\"), no post-signup incentive, slow pages, untested mobile forms.",
]
bullets(d, cases, sans(23), M, y, W - 2 * M, 34, gap=16)
footer(d, 4)
pages.append(im)

# ============ 5. WHAT SELLS SUPPLEMENTS ============
im, d = new_page()
y = header(d, "Research · supplement pages", "What makes someone swallow a new supplement")
y += 24
left = [
    "Clinical proof beats lifestyle photos — numbers close. If there is a study, lead with it (Noctera: 88% of women improved in 3 weeks).",
    "Specific outcomes beat vague wellness — \"sleep gummies\" outsells \"feel better\". Name the exact job.",
    "Ingredient transparency — show milligrams; \"proprietary blend\" reads as a secret.",
    "Real names and faces — named doctors and midlife customers beat anonymous 5-star walls.",
]
right = [
    "Price anchoring — frame the cost vs the alternatives: another broken night, nightly wine, OTC sleep aids.",
    "Reduce decision risk — quizzes, money-back guarantees, \"cancel anytime\".",
    "Make the routine concrete — \"keep it by the bed; when you wake at 3 a.m., take one shot\" beats \"supports restful sleep\".",
    "Answer safety early — melatonin-free, non-habit-forming, no grogginess, plus the FDA disclaimer — not buried in an FAQ.",
]
cw = (W - 2 * M - 60) // 2
d.text((M, y), "The eight principles", font=serif(30, bold=True), fill=NAVY)
yy = y + 56
bullets(d, left, sans(23), M, yy, cw, 34, gap=18)
bullets(d, right, sans(23), M + cw + 60, yy, cw, 34, gap=18)
y2 = y + 56 + 340
d.rectangle((M, y2, W - M, y2 + 250), fill=SAND)
kicker(d, "Designing for women 45+", M + 30, y2 + 24)
items45 = [
    "Empathy first: being understood is the conversion event (\"I thought I was the only one awake at 3\").",
    "No shame, no anti-aging clichés — empowerment, evidence, and real midlife women in the photography.",
    "Trust is the currency: clinicians, study numbers, honest timelines (\"most women notice a difference in 2–3 weeks\").",
    "Legibility is a conversion feature: bigger type, high contrast, plain words, obvious buttons.",
]
bullets(d, items45, sans(23), M + 30, y2 + 66, W - 2 * M - 60, 34, gap=10)
footer(d, 5)
pages.append(im)

# ============ 6. MARKET MAP ============
im, d = new_page()
y = header(d, "The market", "Where the white space is")
y += 24
cards = [
    ("Bonafide Noctera", "Prevention · menopause · clinical",
     "Hormone-free, melatonin-free daily tablet (Mg, GABA, L-theanine, SAMe), $39.99, gynecologist-recommended. Sells \"sleep through the night\"."),
    ("MidNite / Nature Made", "Rescue · mass retail · cheap",
     "\"Back to Sleep\", \"middle-of-the-night support\", melatonin tablets. Proves the occasion is mainstream — but the branding is dated drugstore."),
    ("Beam / Feals", "Bedtime ritual · DTC · lifestyle",
     "Sleep drinks and gummies for falling asleep at bedtime. Subscription models, big brand marketing. Crowded position."),
    ("Rise / Eight Sleep", "Sleep tech · premium · modern",
     "Bold modern design language for sleep. Proof that a premium sleep brand can look contemporary and still feel calm."),
]
cw = (W - 2 * M - 40) // 2
for i, (t, tag, body) in enumerate(cards):
    x = M + (i % 2) * (cw + 40)
    yy = y + (i // 2) * 280
    d.rectangle((x, yy, x + cw, yy + 250), fill=(255, 255, 255), outline=LINE, width=2)
    d.text((x + 28, yy + 24), t, font=serif(30, bold=True), fill=NAVY)
    d.text((x + 28, yy + 68), tag, font=sans(21, bold=True), fill=TERRA)
    para(d, body, sans(22), x + 28, yy + 106, cw - 56, 32, INK)
y += 590
d.rectangle((M, y, W - M, y + 180), fill=NAVY)
kicker(d, "The open ground", M + 30, y + 26, SAND)
para(d, "A premium, modern brand for the 3 a.m. wake-up: \"the shot that gets you back to sleep\" — "
        "made for midlife women first. Rescue positioning, drinkable format, proof-led trust.",
     serif(28), M + 30, y + 68, W - 2 * M - 60, 42, CREAM)
footer(d, 6)
pages.append(im)

# ============ 7. DIRECTIONS DIVIDER ============
im, d = new_page(NAVY)
d.rectangle((M, 420, M + 220, 428), fill=TERRA)
para(d, "Five visual directions", serif(80, bold=True), M, 470, W - 2 * M, 96, CREAM)
para(d, "Real screens from brands that solve the same design problem: selling trust, calm and a promise "
        "of sleep. One page per direction — look at the screens first, read second.",
     ital(28), M, 610, 1100, 42, SAND)
para(d, "A · Calm Twilight      B · Warm Clinical Trust      C · Dark Night Premium      "
        "D · Bold & Playful      E · Soft & Friendly",
     sans(24), M, 760, W - 2 * M, 40, CREAM)
footer(d, 7)
pages.append(im)

# ============ 8. DIRECTION A ============
im, d = new_page()
y = header(d, "Direction A", "Calm Twilight — premium sleep, quietly")
y += 20
frame(d, M, y, W - 2 * M, 620, "Sandland Sleep — sandlandsleep.com (reference)", f"{SCREENS}/style-sandland-sleep.jpg")
y += 660
a_items = [
    "Feels like: a deep navy hero over warm cream, soft round buttons, generous space. Serene, orderly, trustworthy — \"hotel at midnight\".",
    "Why it fits: sleep brands that sell calm actually look calm. This is the most natural home for a 3 a.m. product.",
    "What to steal: twilight navy + cream palette, one warm accent color on the CTA (yellow/gold), tidy product cards, simple badges (\"melatonin-free\", \"non-habit-forming\").",
    "Watch-out: it can feel cold or sleepy-safe — pair it with warm human photography of real midlife women so it doesn't read as generic.",
]
bullets(d, a_items, sans(22), M, y, W - 2 * M, 32, gap=12)
footer(d, 8)
pages.append(im)

# ============ 9. DIRECTION B ============
im, d = new_page()
y = header(d, "Direction B", "Warm Clinical Trust — proof with a human face")
y += 20
fw = (W - 2 * M - 40) // 2
frame(d, M, y, fw, 560, "Seed — seed.com", f"{SCREENS}/style-seed.jpg")
frame(d, M + fw + 40, y, fw, 560, "Function — functionhealth.com", f"{SCREENS}/direction-function-health.png")
y += 600
b_items = [
    "Feels like: science you can trust without the clinic — cream/white surfaces, editorial serif headlines, precise ingredient detail, warm accents.",
    "Why it fits: our audience buys on proof and honesty. This is the direction Noctera's buyers respond to (clinical claims + gynecologist trust).",
    "What to steal: lead with numbers (\"88% improved in 3 weeks\" once we have study data), show milligrams of every ingredient, name the formulator, anchor price against \"another broken night\".",
    "Watch-out: clinical can feel cold — keep the serif-warmth (Function's approach) and real women's stories in the mix.",
]
bullets(d, b_items, sans(22), M, y, W - 2 * M, 32, gap=12)
footer(d, 9)
pages.append(im)

# ============ 10. DIRECTION C ============
im, d = new_page()
y = header(d, "Direction C", "Dark Night Premium — designed for 3 a.m.")
y += 20
fw = (W - 2 * M - 40) // 2
frame(d, M, y, fw, 560, "Eight Sleep — eightsleep.com", f"{SCREENS}/direction-eight-sleep.png")
frame(d, M + fw + 40, y, fw, 560, "Eight Sleep — style reference", f"{SCREENS}/style-eight-sleep.jpg")
y += 600
c_items = [
    "Feels like: midnight-black canvas, one glowing accent, crisp large type — intimate, luxurious, made for the bedroom.",
    "Why it fits: the product literally lives at night. A dark page is the closest visual translation of \"3 a.m.\" and stands out in a feed of white supplement pages.",
    "What to steal: dark hero + one electric accent, large light-weight headlines, night-time lifestyle photography, sharp clean buttons.",
    "Watch-out: older audiences read small light-on-dark text poorly — keep type large and high-contrast, and use light sections for the proof and FAQ blocks.",
]
bullets(d, c_items, sans(22), M, y, W - 2 * M, 32, gap=12)
footer(d, 10)
pages.append(im)

# ============ 11. DIRECTION D ============
im, d = new_page()
y = header(d, "Direction D", "Bold & Playful — loud shelf energy")
y += 20
fw = (W - 2 * M - 40) // 2
frame(d, M, y, fw, 560, "SuperMush — supermush.com", f"{SCREENS}/style-supermush.jpg")
frame(d, M + fw + 40, y, fw, 560, "SwimClub — swimclub.co", f"{SCREENS}/style-swimclub.jpg")
y += 600
d_items = [
    "Feels like: big confident type, punchy accent colors (SuperMush) or severe editorial contrast with giant stats (SwimClub). Energetic, memorable, young.",
    "Why it fits: it stops the scroll and differentiates from \"another pastel wellness brand\" — and SwimClub's stat-first style is a great proof pattern.",
    "What to steal: oversized statistics (\"fall back asleep in 12 min\"), high-contrast badges, a single strong accent color, magazine-style layouts.",
    "Watch-out: the energy can clash with a 3 a.m. promise and skew young. If we go here, borrow SwimClub's calm severity (mono + one accent) more than SuperMush's party.",
]
bullets(d, d_items, sans(22), M, y, W - 2 * M, 32, gap=12)
footer(d, 11)
pages.append(im)

# ============ 12. DIRECTION E ============
im, d = new_page()
y = header(d, "Direction E", "Soft & Friendly — approachable, gentle, safe")
y += 20
fw = (W - 2 * M - 40) // 2
frame(d, M, y, fw, 560, "Headspace — headspace.com", f"{SCREENS}/style-headspace.jpg")
frame(d, M + fw + 40, y, fw, 560, "Alveos Labs — alveoslabs.com", f"{SCREENS}/style-alveos.jpg")
y += 600
e_items = [
    "Feels like: rounded shapes, soft pastels (Headspace) or warm desaturated luxury (Alveos). Reassuring and unintimidating — \"nothing scary here\".",
    "Why it fits: lowers the fear barrier for people burned by sleep meds and grogginess. Alveos' warm luxury is a strong base for a premium price.",
    "What to steal: rounded pill buttons, soft panels, calm gradients, friendly illustrations for \"how it works\", muted warm palette with one accent.",
    "Watch-out: too soft can look like a toy or a meditation app — anchor it with clinical proof blocks and serious photography to earn a premium price.",
]
bullets(d, e_items, sans(22), M, y, W - 2 * M, 32, gap=12)
footer(d, 12)
pages.append(im)

# ============ 13. WAITLIST ANATOMY IN ACTION ============
im, d = new_page()
y = header(d, "Mechanics", "The waitlist moment, in practice")
y += 20
fw = (W - 2 * M - 40) // 2
frame(d, M, y, fw, 560, "A real waitlist page — reclaim.ai", f"{SCREENS}/waitlist-anatomy-reclaim.png")
frame(d, M + fw + 40, y, fw, 560, "A real email capture — seed.com", f"{SCREENS}/screen-seed-emailcapture.jpg")
y += 600
w_items = [
    "Both do the same five things: one clear promise, one field, one button, proof or a visual reward, and nothing else competing for attention.",
    "Our hero: headline + subhead + email field + button + one proof line + small FDA disclaimer. No menu. No links out.",
    "After signup: \"You're #182 in line — invite 3 friends to move up and unlock founder pricing.\" (This is where growth compounds.)",
    "Also worth having: a short 3-question \"how do you sleep?\" quiz to segment the list and personalize launch emails (Feals' \"find my dose\" pattern).",
]
bullets(d, w_items, sans(22), M, y, W - 2 * M, 32, gap=12)
footer(d, 13)
pages.append(im)

# ============ 14. HOW THE CATEGORY LOOKS ============
im, d = new_page()
y = header(d, "Category context", "How the neighbors sell sleep and midlife health")
y += 20
fw = (W - 2 * M - 40) // 2
frame(d, M, y, fw, 560, "RISE — risescience.com (sleep, bold)", f"{SCREENS}/competitor-risescience.png")
frame(d, M + fw + 40, y, fw, 560, "Hers — forhers.com (women's health, trust-led)", f"{SCREENS}/screen-hers-womenshealth.jpg")
y += 600
k_items = [
    "RISE: sells the morning after, not the night — \"the power behind your next best day\". Modern, bold, optimistic. (Also shows what to avoid: cookie walls and app-first journeys.)",
    "Hers: women's health made mainstream — bold black/green type, product-forward hero, FAQs and testimonials stacked to build trust step by step.",
    "For us: borrow RISE's confidence and Hers' trust architecture — but keep our moment at night, not the gym or the clinic.",
    "Also studied (text only, dated retail design): MidNite \"Back to Sleep\" and Nature Made \"Wellblends Back to Sleep\" — they validate the phrase we want to own.",
]
bullets(d, k_items, sans(22), M, y, W - 2 * M, 32, gap=12)
footer(d, 14)
pages.append(im)

# ============ 15. RECOMMENDATION ============
im, d = new_page()
y = header(d, "Recommendation", "Where we would start")
y += 24
d.rectangle((M, y, W - M, y + 200), fill=NAVY)
kicker(d, "Our pick", M + 30, y + 26, SAND)
para(d, "B (Warm Clinical Trust) as the backbone, with A (Calm Twilight) colors for the night-time hero.",
     serif(34, bold=True), M + 30, y + 70, W - 2 * M - 60, 46, CREAM)
para(d, "Trust and proof win this audience; calm night aesthetics own the occasion. Dark-mode (C) can live "
        "in the hero and social ads; SwimClub-style stat blocks carry the proof section.",
     ital(23), M + 30, y + 128, W - 2 * M - 60, 32, SAND)
y += 236
rec = [
    "Hero: twilight-navy gradient, serif headline \"Awake at 3 a.m.? Get back to sleep — without starting your day.\", email form, proof line, FDA line.",
    "Body: warm cream/white, editorial serif section titles, ingredient cards with milligrams, real women's stories with ages, doctor quote, comparison strip vs melatonin and bedtime teas.",
    "Offer: waitlist first (primary button) + \"Founders' Club\" refundable deposit for the first batch (secondary button) — early-bird price + priority shipping.",
    "Confirmation screen: queue position, share link, and one question (\"what's your worst 3 a.m. story?\") for content and list growth.",
    "Page options: A/B test two headlines (rescue vs audience-specific) and two CTA labels; measure visit→signup weekly and aim for 10%+ before buying traffic.",
]
d.text((M, y), "The page, section by section", font=serif(30, bold=True), fill=NAVY)
y += 52
bullets(d, rec, sans(23), M, y, W - 2 * M, 34, gap=16)
footer(d, 15)
pages.append(im)

# ============ 16. BLUEPRINT ============
im, d = new_page()
y = header(d, "Blueprint", "The nine sections of the page — one job each")
y += 24
sections = [
    ("1 · Hero", "Outcome headline + email form + one CTA + proof line + FDA line"),
    ("2 · The moment", "\"You've been here\" — the 3 a.m. wake-up, told with a real midlife woman"),
    ("3 · How it works", "Keep by the bed → take when you wake → drift back, no grogginess"),
    ("4 · What's inside", "Every ingredient with milligrams and a one-line reason"),
    ("5 · Proof", "Pilot stories (with ages), study numbers when we have them, clinician quotes"),
    ("6 · Why it's different", "Speed + occasion vs bedtime teas, melatonin, nightly tablets"),
    ("7 · Safety & FAQ", "Grogginess, habit-forming, interactions, shipping date, guarantee"),
    ("8 · Final CTA", "Email capture repeat + Founders' Club deposit button"),
    ("9 · Confirmation", "Queue position + referral link + \"tell us your worst 3 a.m. story\""),
]
cw = (W - 2 * M - 40) // 3
for i, (t, body) in enumerate(sections):
    x = M + (i % 3) * (cw + 20)
    yy = y + (i // 3) * 220
    d.rectangle((x, yy, x + cw, yy + 196), fill=(255, 255, 255), outline=LINE, width=2)
    d.rectangle((x, yy, x + cw, yy + 6), fill=TERRA)
    d.text((x + 22, yy + 26), t, font=serif(26, bold=True), fill=NAVY)
    para(d, body, sans(21), x + 22, yy + 72, cw - 44, 30, INK)
footer(d, 16)
pages.append(im)

# ============ 17. COPY DRAFTS ============
im, d = new_page()
y = header(d, "Copy starters", "Drafts to react to — nothing here is final")
y += 24
d.text((M, y), "Headline options", font=serif(30, bold=True), fill=NAVY)
y += 52
heads = [
    "A. \"Awake at 3 a.m.? Get back to sleep — without starting your day.\" (direct, rescue)",
    "B. \"The 3 a.m. sleep shot for the nights menopause steals.\" (audience-specific)",
    "C. \"Go back to sleep in minutes. Wake up like nothing happened.\" (outcome + anti-groggy)",
    "D. \"Your night-shift nurse in a 2-oz shot.\" (metaphor)",
]
y = bullets(d, heads, sans(23), M, y, W - 2 * M, 34, gap=14, marker="•")
y += 12
d.text((M, y), "Subhead", font=serif(30, bold=True), fill=NAVY)
y += 52
y = para(d, "\"A drug-free, melatonin-free sleep shot made for the wake-up-in-the-middle-of-the-night kind "
            "of night. Take it when you wake — back asleep before you've checked the clock twice.\"",
         ital(23), M, y, W - 2 * M, 34, INK)
y += 16
d.text((M, y), "Buttons & proof lines", font=serif(30, bold=True), fill=NAVY)
y += 52
btns = [
    "CTA: \"Get early access\"  ·  \"Join the waitlist\"  ·  \"Reserve my first batch\"  ·  \"Sleep through the night again\"",
    "Proof: \"Join 800+ women on the waitlist\"  ·  \"Formulated with [clinician], reviewed by [N] specialists\"  ·  \"[X]% fell back asleep within [Y] minutes*\" — real numbers only",
    "Risk reversal: \"Founder pricing locked in\"  ·  \"Refundable deposit\"  ·  \"Cancel anytime\"  ·  \"Ships [month] — or your money back\"",
]
y = bullets(d, btns, sans(23), M, y, W - 2 * M, 34, gap=14, marker="•")
y += 24
d.rectangle((M, y, W - M, y + 120), fill=SAND)
para(d, "Compliance reminder: structure/function claims only (\"supports sleep\", \"helps you fall back asleep\") — "
        "never \"treats insomnia\". Every claim area carries the FDA disclaimer. Testimonials must be honest and "
        "typical-results-disclosed (FTC).", sans(21), M + 28, y + 22, W - 2 * M - 56, 30, INK)
footer(d, 17)
pages.append(im)

# ============ 18. DECISION CHECKLIST ============
im, d = new_page()
y = header(d, "Decide", "Mom's checklist — pick a direction in one sitting")
y += 24
qs = [
    "Which screen made you feel the most trust? (That's the backbone — B-style proof or C-style premium.)",
    "Which palette feels like 3 a.m. to you — twilight navy + cream, warm cream + terracotta, or midnight black + glow?",
    "Should the hero sell the rescue moment (\"back to sleep tonight\") or the audience (\"made for menopause\")? Pick one for A/B test #1.",
    "How bold should the numbers/stat blocks be — quiet and factual (Seed) or giant and editorial (SwimClub)?",
    "Do we show the bottle in the hero (product-forward, Hers) or the woman in the moment (story-forward, Function)?",
    "Waitlist only, or waitlist + refundable Founders' Club deposit for the first batch?",
    "What is the one promise we can defend today — speed (\"back to sleep in minutes\"), feel (\"no grogginess\"), or safety (\"drug-free, melatonin-free\")?",
    "Who is the first face of the brand — Mom herself (founder story), a clinician, or customers?",
]
y = bullets(d, qs, sans(23), M, y, W - 2 * M, 34, gap=18, marker="□", mcolor=NAVY)
y += 16
d.rectangle((M, y, W - M, y + 110), fill=NAVY)
para(d, "Next step once a direction is picked: build the one-page waitlist (1 week), drive a small test of traffic, "
        "and measure visit→signup. Aim for 10%+ before spending on ads.",
     sans(22), M + 28, y + 26, W - 2 * M - 56, 32, CREAM)
footer(d, 18)
pages.append(im)

# ============ 19. SOURCES ============
im, d = new_page()
y = header(d, "Appendix", "Sources & notes")
y += 24
src = [
    "Flowjam — \"Waitlist Landing Page Examples: 7 That Convert at 20%\" (2026): conversion benchmarks, five-part anatomy, referral loop.",
    "LaunchList — \"15 Waitlist Landing Page Examples That Convert\" (2026): Robinhood, Notion, Superhuman, Dropbox mechanics, mistakes, metrics.",
    "SwipePages — \"8 Best Wellness, Supplement & Self-Care Landing Page Examples of 2026\": proof, specificity, quizzes, price anchoring, safety.",
    "PreProduct — \"11 Best Pre-Order Landing Page Examples\": pre-order elements, payment flexibility, common mistakes.",
    "Bonafide Noctera: Pharmavite press release (Feb 2026), Nutraceuticals World, The Quality Edit review — formula, study, positioning.",
    "MidNite \"Back to Sleep\" & Nature Made \"Wellblends Back to Sleep\" product pages — retail positioning language for the occasion.",
    "Spark Growth — \"Marketing Menopause Products\" (2026); Quimby Femtech — \"Menopause Brand Marketing\": 45+ audience, trust and empathy.",
    "Refero (refero.design) design library — style and screen references used as direction examples (Sandland Sleep, Seed, Function, Eight Sleep, SuperMush, SwimClub, Headspace, Alveos, Reclaim, Hers).",
    "Screenshots in this deck were captured live in September 2026; brands change their pages often.",
]
y = bullets(d, src, sans(22), M, y, W - 2 * M, 32, gap=16, marker="·", mcolor=GRAY)
y += 24
d.line((M, y, W - M, y), fill=LINE, width=2)
para(d, "Full research write-up with all findings, competitor table and page blueprint: "
        "research/report/waitlist-research.md  ·  Screen folder: research/screens/",
     ital(22), M, y + 24, W - 2 * M, 32, GRAY)
footer(d, 19)
pages.append(im)

# ============ SAVE ============
pages[0].save(OUT, "PDF", resolution=150.0, save_all=True, append_images=pages[1:])
print(f"Wrote {OUT} ({len(pages)} pages)")

import os, sys
prev = "/Users/groot/mom317/research/report/preview"
if "--preview" in sys.argv:
    os.makedirs(prev, exist_ok=True)
    for i, p in enumerate(pages, 1):
        p.save(f"{prev}/page-{i:02d}.png")
    print(f"Previews in {prev}")
