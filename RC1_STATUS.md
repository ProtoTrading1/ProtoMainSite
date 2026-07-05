# Proto Trading Online — Release Status

Last updated: 2026-07-05

## Objective

Make Proto Trading Online the **fastest and easiest wholesale ordering website**.

**Decision rule:** Before any change, ask:
1. Does this help a wholesale customer **find products faster**?
2. Does this help a wholesale customer **place an order faster**?
3. Does this **reduce friction**?

If no → record as Post-RC1 enhancement, do not implement.

---

## Frozen (do not change without approval)

| Area | Status | Reference |
|------|--------|-----------|
| Search | **FROZEN** | RC1.1 complete |
| Sorting | **FROZEN** | Sort Phase 1 |
| Product card layout | **FROZEN** | RC1.2 Phase 1 |
| **Welcome flow & Home navigation** | **FROZEN** | PR #46 — `eb5bfe3` |

See `.cursor/rules/welcome-flow-frozen.mdc` for Welcome lifecycle spec.

---

## Production

| Item | Value |
|------|-------|
| Branch | `main` @ `eb5bfe3` |
| Deploy | Vercel (`protoportal-main.vercel.app` / site.proto.co.za) |
| RC1 Welcome & Home | **Deployed 2026-07-05** |

---

## RC2 (approved for future — NOT RC1)

**Resume Shopping** — Remember the customer's previous browsing context (category, search, scroll position) and allow them to return exactly where they left off after visiting the Welcome screen.

**Do not implement during RC1.**

---

## Delivered & stable

| Milestone | Status | Reference |
|---|---|---|
| RC1 registration/header refinement | Merged | PR #34 |
| RC1 Welcome Screen & Home Navigation | **Deployed** | PR #46 — `eb5bfe3` |
| RC1.3A Available Only filter | **Deployed** | PR #47 — `da37b75` |
| P2.1 Premium Product Cards | **Rolled back** | Revert `b954f1f` (PR #35) |

### Repository separation

- **Proto-Website** (`protoportal-main`) — sole active development repo
- **protoportal-admin** / `admin.proto.co.za` — out of scope unless explicitly requested

---

## Post-RC1 enhancements (deferred)

- **Resume Shopping** (RC2 approved)
- Premium product card cosmetic polish (P2.1 rolled back)
- Skeleton loading grid
- Stock badges / low-stock indicators
- Add to Cart “Added ✓” grid feedback

---

## Execution mode

**STOP after RC1 Welcome deploy + QA.** Await approval before next RC1 sprint.
