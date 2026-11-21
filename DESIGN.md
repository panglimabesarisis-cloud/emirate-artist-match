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