# Proto Trading Online — Release Status

Last updated: 2026-07-04

## Objective

Make Proto Trading Online the **fastest and easiest wholesale ordering website**.

**Decision rule:** Before any change, ask:
1. Does this help a wholesale customer **find products faster**?
2. Does this help a wholesale customer **place an order faster**?
3. Does this **reduce friction**?

If no → record as Post-RC1 enhancement, do not implement.

---

## Layout freeze (effective immediately)

The current desktop layout is **frozen**. Do not redesign:

- Pages
- Navigation
- Product cards
- New widgets or dashboards

Visual changes are only permitted when they directly fix a **usability issue** discovered during testing.

---

## Delivered & stable

| Milestone | Status | Reference |
|---|---|---|
| RC1 registration/header refinement | Merged | PR #34 — `c7ce3e8` |
| P2.1 Premium Product Cards | **Rolled back** | Revert `b954f1f` (PR #35) |
| Production | Live | `main` @ `b954f1f` |

### Repository separation

- **Proto-Website** (`protoportal-main`) — sole active development repo
- **protoportal-admin** / `admin.proto.co.za` — out of scope unless explicitly requested

---

## RC1 priority order (refined)

One stage at a time. **Do not begin a new stage without approval.**

### RC1.1 — Search Foundation ⏳ NEXT

Complete and verify all search functionality:

- Autocomplete
- Search relevance
- Search consistency
- Keyboard navigation
- Accessibility
- Tablet
- Mobile
- Performance

**Status:** Awaiting approval to begin.

### RC1.2 — Search Excellence

Improve search quality only if required after RC1.1 testing:

- Typo tolerance, SKU/barcode/supplier/department/category matching
- Search highlighting, speed, empty states, ranking

Only implement improvements with measurable value.

**Status:** Not started.

### RC1.3 — Ordering Workflow

Review complete customer ordering journey. Reduce clicks and time to build an order:

- Quantity changes, Add to Cart, cart updates, checkout
- Keyboard efficiency, repeat ordering speed

**Status:** Not started.

### RC1.4 — Performance

- Reduce unnecessary API calls
- Improve perceived speed and loading states
- Reduce layout shifts
- Optimise images and bundle size where appropriate

**Status:** Not started.

### RC1.5 — Mobile

Ensure mobile ordering is as efficient as possible:

- Large touch targets, search usability, cart usability, checkout usability

**Status:** Not started.

### RC1.6 — Accessibility & QA

Final accessibility review:

- Keyboard navigation, screen reader support, focus management
- Cross-browser testing

**Status:** Not started.

---

## Post-RC1 enhancements (deferred)

Recorded but not scheduled:

- Premium product card cosmetic polish (P2.1 rolled back — broke card layout)
- Skeleton loading grid
- Stock badges / low-stock indicators
- Add to Cart “Added ✓” grid feedback

---

## Execution mode

Active. Work one approved RC1 stage at a time. Await approval before beginning RC1.1.
