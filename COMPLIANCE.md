# Compliance Register
Snapshot: 26 October 2026 · EZ Coder compliance-guard · ENGINEERING GUIDANCE, NOT LEGAL ADVICE
Base commit: eeccf5b8d9ba17a141d6fb906b619e5f652e3c1c plus uncommitted carousel changes.

## Scope and exposure
This is a feature-specific inline record, **not an audit of the existing site or engine**. Confirmed: approved general menopause education adapted into AI-illustrated assets, sent only to the owner's requested recipient, with no auto-posting, diagnosis, health-data intake, ad tracking or consumer payments added. Assumed: the owner reviews assets before publishing to her audience. Existing posts' medical-source/legal approval is outside this pass.

## Findings and controls
| ID | Severity | Trigger | Evidence | Obligation / control | Status | Guard |
| --- | --- | --- | --- | --- | --- | --- |
| BC-1 | HIGH | Condensing medical education can remove important qualifiers | CODE + local render/test execution | Approved/published-only source gate, exact evidence, short current-post editorial copy; future AI summaries get a separate support check; no invented efficacy/dose/clinician credentials | Implemented; editorial/legal review remains the owner's responsibility | `engine/test/carousel.test.js` |
| BC-2 | MEDIUM | Synthetic brand imagery can imply a real founder or product | CODE + inspected generated artwork | No people, founder likeness or product imagery; AI disclosure in captions, sources, alt text and delivery email | Implemented | Caption assertions and inspected artwork |
| BC-3 | HIGH | Provider credentials and workflow artifacts | RUNTIME (private-key permission check and API checks) + CODE | Key outside Git, 0700/0600 local backup; Railway server secret; existing Codex login only read in process; no secret-bearing response logging; fixed recipient and request hash | Implemented within this feature | Failure-path, recipient and payload tests |
| BC-4 | MEDIUM | Images of text and small type on social media | RUNTIME (390px/1440px preview and literal contrast test) | Short headlines, large main text, strong text contrast; separate per-slide alternative text for Instagram entry | Implemented; actual Instagram assistive technology/upload not checked | Render/contrast tests and captured previews |

## Plain-language check
Slides, captions, alt text and emails use short, everyday words. Code checks word counts, blocks medical jargon and estimates reading grade at five or below. This is not a formal reading-level test. Full source titles and exact quotes stay in the separate source notes. All four simpler packs were downloaded from their sent emails and checked. Resend reports all four delivered.

## Needs owner / lawyer review
Before public posting, review shortened medical wording against the linked approved article and decide whether additional claims review is needed for the brand and intended audience. Do not interpret this register as clearance for supplement efficacy, diagnosis or treatment claims. No such new claims were added here. Enter supplied alt text when uploading to Instagram. Check the platform's current AI-disclosure requirements at posting time; no date-sensitive legal certification is made.

## Not checked
Existing waitlist privacy/consent, old blog claims, other email campaigns, whole-repo security, inbox placement, actual Instagram upload/compression or platform accessibility. Those were not part of this feature request.
