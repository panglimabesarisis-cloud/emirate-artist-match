# Travel and open inquiries

## Artist travel settings
- Dashboard > Profile > Where and how much > Add cost per distance.
- Disabled by default. The owner can enable a positive AED tariff per started 5 or 10 km beyond the saved radius.
- Example: radius 30 km, distance 50 km, AED 50 per 10 km gives AED 100 excluding VAT.
- The server calculator supplies estimates from explicit client distance statements such as `Jarak: 50 km` or `distance 50 km`.
- City names do not establish distance. No routing provider, geocoding, draggable pin, or map was added in these phases.
- Estimates remain separate from package prices and are passed to artist review; no automatic payable surcharge or settlement is introduced.

## Broadcast inquiries
- Client portal > Open inquiries > Post inquiry: title, brief, category, preferences, event date/hours, venue, AED budget.
- Every approved artist owner can see an open, future inquiry; preferences are information, not an inferred eligibility filter.
- PDF/JPG/PNG documents up to 5 MB can be attached after posting. They are private to the client and approved applicants; AI document extraction was not added.
- Artist dashboard > Open inquiries: search, Apply Job, optional proposed price, withdraw a pending application.
- Dashboard counts refresh every 30 seconds. Artist notification icon opens inquiries when available; client sidebar counts pending applications.
- Client Approve & chat creates one linked quote and AI conversation atomically. Repeated approval returns the same conversation.
- Multiple applicants may be approved for separate negotiations. Approval is not a price acceptance, booking, calendar reservation, invoice, or payment.
- Existing AI reply credit rules and artist approval/checkout rules apply when chatting. No changes to subscription or pack prices.
- Closing an inquiry stops new applications; existing applicants retain its details.

## Verification
- 71 targeted unit/regression tests passed.
- Rollback-only tests in a fresh local database passed: owner-only travel settings, valid intervals, client-owned inquiries, approved-artist broadcast reads, duplicate application/approval safety, document gating, anonymous denial, and unchanged booking/invoice counts.
- Signed-in client portal and populated inquiry form checked without screenshots or console errors.
- Full live post → apply → approve → AI reply and real document upload/download were not exercised: the available temporary account is not an approved artist, and no production inquiry/test files were created.
- Publish the application changes before testing the new UI on the live domain. The schema changes are already applied.