# Proto Trading Online — Release Status

Last updated: 2026-07-04

## RC1 — Complete

RC1 is considered **complete**. The website is stable and production-ready.

| Milestone | Status | Reference |
|---|---|---|
| RC1.1 refinement | Merged | PR #34 — `c7ce3e8` |
| Production deploy | Live | `main` @ `c7ce3e8` |

### RC1.1 scope (delivered)

- Premium B2B header with inline search
- Proto Trading Online logo and branding
- About modal (map, contact, office address)
- Registration wizard (billing/delivery, 4-step flow, country UX)

### Repository separation

- **Proto-Website** (`protoportal-main`) — active development repo
- **protoportal-admin** / `admin.proto.co.za` — not modified during RC1 or P2.1

---

## Phase 2 — Customer Experience Refinement

Phase 2 shifts from engineering refinement to **visible customer experience refinement**.

Every improvement must be immediately noticeable and satisfy at least one business objective (faster ordering, better discovery, larger basket, higher AOV, perceived quality, customer confidence).

### Priority order

1. **Premium Product Cards** — presentation polish
2. **Search Experience** — autocomplete, highlighting, empty states, keyboard flow
3. **Stock Visibility** — badges, low-stock indicators, live stock improvements

---

## P2.1 — Complete

**Tag:** `P2.1_COMPLETE`  
**Merged:** PR #35 — `e912154`  
**Branch:** `cursor/p2-1-premium-card-grid-1536`

### Delivered

- Pure white image wells (`#ffffff`) — no coloured backgrounds
- Longest-edge normalization (92% of inner frame) for consistent perceived size across aspect ratios
- `object-fit: contain` — no crop, no stretch
- Equal card heights via flex footer pinning (desktop + mobile)
- Premium typography, spacing, and stacked price presentation
- Subtle hover lift + image scale (desktop; disabled on touch / reduced-motion)
- Mobile equal-height cards with 44px touch targets preserved

### Pre-merge visual audit (2026-07-04)

Categories audited: **Beads**, **Bags**, **Boxes**, **Glass**, **Toys**, **Stationery**

| Category | Finding | Action |
|---|---|---|
| Beads | Wide vs portrait height spread (57px) | Fixed — longest-edge normalization |
| Bags | Consistent (0px height spread) | No change |
| Boxes | Consistent heights | No change |
| Glass | Wide rondelles noticeably shorter | Fixed — longest-edge normalization |
| Toys | Consistent (0px height spread) | No change |
| Stationery | Wide memo books shorter | Fixed — longest-edge normalization |

**Success criterion:** Customer should notice the improvement within 3 seconds of opening the catalogue.

### Deferred to P2.2

- Skeleton loading grid (replaces full-page spinner)

### Not started

- Add to Cart “Added ✓” feedback on grid cards
- Search experience (Priority 2)
- Stock badges (Priority 3)

---

## Next step

**P2.2** — Skeleton loading. Awaiting instruction before beginning.
