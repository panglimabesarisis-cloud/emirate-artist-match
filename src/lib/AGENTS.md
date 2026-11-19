# Booking workflow rules

- Reachable Rate Card flow blocks enable artist-item invoice approval; snapshot event hours and job details on the booking, approve items atomically, and never treat draft prices or AI payment claims as settlement.
- Booking deposits use VAT-inclusive minor units with server-owned percentages; settlement adds only the verified amount, linked invoices become paid only at full settlement, and calendar writes use deterministic event IDs.
- Managed booking jobs retry failed calendar writes and claim H-7 reminders before dispatch; WhatsApp acceptance is not delivery and public jobs must authenticate managed cron requests.
