# Public browse and artist presentation
- Every artist search bar offers name/talent/city text plus Talent and City selects defaulting to All; matching lives in src/lib/artist-search.ts and /all is a pseudo-category on the existing listing routes.
- Join-as-talent calls to action are wrapped in HideForArtist, and every dashboard header uses the shared LogoutButton.
- Browse Talent and For clients share ClientBookingGuide and the public concierge; AI Elements present chat while server-owned approved catalog records supply links, and the concierge has no private reads or action tools. Artist presentation remains scoped and preserves existing data handlers.
- Public artist profiles show saved professional fields and public client/portfolio rows in the left column; only artist-owned media paths are signed, while owner preview shares the upload photo query and private account/financial fields stay excluded.
- Catalog cards and key-verified client chat headers use the same saved portrait through artist-owned signed paths; initials are reserved for artists without a profile photo, and historical invoices keep their existing snapshots.
