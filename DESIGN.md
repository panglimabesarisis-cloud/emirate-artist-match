# How it works: design brief

## Brief
Refresh only /how-it-works, using /features as the visual authority. Explain the actual client and artist workflows, without implying live payments or guaranteed external delivery. Existing English-first public content is retained. No fictional credentials, statistics, prices, or testimonials are needed.

## Concept exploration
Scores: originality / fit / feasibility / portability (lower portability is better).
- Booking journey: follow an enquiry through discovery, artist approval and event completion. Signature: alternating numbered stages and compact process diagrams. Emotion: clarity. Screenshot: the arch scene above the two audience journeys. Anchor: artist approval precedes payment. Scores 4/5/5/2.
- Backstage desk: group profile, inbox, calendar and documents as a working desk. Signature: grouped operational tools. Emotion: control. Screenshot: an artist workspace taxonomy. Anchor: one workspace manages bookings. Scores 3/4/5/4.
- Two sides of one event: parallel client and artist columns. Signature: aligned milestones. Emotion: partnership. Screenshot: mirrored journeys. Anchor: client enquiry meets artist approval. Scores 4/4/3/3.

## Chosen concept
Idea: One event, from the first enquiry to the final review.
Metaphor: A booking itinerary with a clear artist checkpoint.
Signature: Six ordered stages grouped into client and artist journeys; each text section pairs with an editorial process diagram, not a fabricated app screenshot.
Emotion: Confidence through clear responsibilities.
Motion verb: Settle, matching the existing feature page's restrained responses.
Screenshot: Existing Dealmaker arch scene, large Bebas Neue heading, journey links and the beginning of the client section.

## System
- Use the existing global semantic tokens only: ink ground, cream text, muted text, gold accent and the existing border/surface roles. No new palette.
- Bebas Neue headings, Manrope body, established Arabic fallback. Fixed breakpoint sizes, tracking zero, body 16–18px and comfortable leading.
- Reuse ReferenceTheme, PublicLayout, SceneBackground and information.css. TanStack Start remains unchanged because this is an existing app.
- Existing 1440px constrained grid with 48px desktop / 20px phone gutters; alternating full-width stages, unframed audience introductions, compact FAQ and final actions.
- Diagrams stay unframed, with dividing lines and icons; no nested cards. Repeated milestone icons have stable dimensions.
- Existing shared scene clock supplies idle life; no new animation engine, loader or dependencies. Reduced-motion follows the existing scene fallback. Controls settle slightly on hover/press with visible focus.

## Composition
```text
ARCH SCENE / HOW IT WORKS
         large title
         short overview
     clients | artists | questions
CLIENT JOURNEY / intro
01 text                     discovery diagram
   enquiry diagram          02 text
03 text                     event milestones
ARTIST JOURNEY / intro
   profile milestones       04 text
05 text                     AI configuration diagram
   management milestones    06 text
FAQ heading                 expandable answers
FINAL heading               find talent / join
```

## Content boundaries and QA
Cover search filters, artist media/packages/reviews, quotes and structured chat, calendar checks, artist approval, invoices/contracts, demo deposit/balance, completed-booking reviews; artist signup/profile review, rate cards, AI flow forms/buttons/knowledge, inbox handover, team roles, calendar connection and separate earnings/AI-credit wallets. Explain plan limits without inventing counts. WhatsApp/email notifications depend on provider configuration.

Genericness check: replace interchangeable benefit cards and invented metrics with the actual approval checkpoint and six specific booking stages. Retain the requested Features aesthetic instead of introducing another visual identity.

Skill reference files are not available in this workspace; use the supplied design skill body and existing page as the implementation reference. User requested no screenshots or extra testing; verification is limited to source review and available build diagnostics. No production visual score or end-to-end payment claim is made.

## For clients extension
Brief: /for-clients is a separate client-facing page, not another link to /how-it-works. Keep the latter intact. The homepage and How it works define the art direction; retain TanStack Start and the existing navigation.

Concept options (originality / fit / feasibility / portability):
- The event brief: organise discovery around the client’s occasion and requirements, then show what to compare. Signature: editorial event-type strip and profile checklist. Anchor: category, specialty and location search. Emotion: possibility. Frame: arch scene and event types. Scores 4/5/5/2.
- The approval checkpoint: trace brief, artist review and agreement. Signature: a three-stage process beside the enquiry section. Anchor: artists approve offers before payment. Emotion: assurance. Frame: artist approval diagram. Scores 4/5/5/2.
- The event file: organise all messages and documents as a chronological dossier. Signature: numbered document milestones. Anchor: secret booking links and linked invoices. Emotion: order. Frame: booking document sequence. Scores 3/4/5/3.

Selected: the event brief, supported by the approval checkpoint. Clients should see both the occasion they are planning and the information they need to book.

System: reuse the existing ink/cream/gold tokens, Bebas Neue/Manrope typography, arch scene and alternating sections. Add only page-scoped event-type strip and trust-band styles. Stable icon sizes, 8px maximum item radius, zero tracking, fixed breakpoint type sizes and inherited reduced-motion behavior. Existing scene clock is the only idle driver. No fictional talent, prices, metrics or payment guarantees.

```text
ARCH SCENE / FOR CLIENTS
      Book talent for your event
      find talent | booking guide
Weddings / Corporate / Private / Cultural
Discovery text                 comparison checklist
Brief-to-approval sequence      enquiry text
Booking documents text         event milestones
Trust principles / unframed full-width band
Client questions               expandable answers
Final action / browse talent
```

Genericness check: avoid generic benefit cards and an artist-signup pitch; use client event types, real profile evidence, artist-reviewed offers and demo payment disclosure. Desktop and mobile For clients links both target the new content route. No screenshots, production visual score or live-payment verification.