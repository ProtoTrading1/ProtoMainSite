# Customer recovery repair — local increment

Base: published draft recovery candidate6bc0e97d0706a85bcec4f4c4549aed4a755437df. This increment is local and has no deployment or schema migration.

A customer with an uncertain saved checkout can now use **Check saved request**. The authenticated read-only endpoint compares the complete original intent with the exact owned reference and protected capture. It returns only the order receipt and explicitly leaves notification delivery unchecked. It never captures, dispatches, sends, cleans baskets, or authorizes a new reference from an absent row. Historical or mismatched captures require reconciliation. The original reference and corrected basket survive read errors, timeouts, account changes and unavailable device storage. Durable receipt promotion is separately required before the existing guarded cleanup/retirement actions.

The UI distinguishes the saved request from the current basket using line counts, item totals and the reference. A fresh interrupted checkout exposes the check immediately. Accepted anchors are still retired only after verified submitted cleanup or explicit verified preservation of a different synced basket. Checking does not submit the current basket.

Instore checkout now applies the existing price/stock snapshot review contract to fresh authoritative data and aggregate quantities. Listing/index/duplicate/minimum-stock gates and captured immutable replay remain unchanged. Earlier candidate source-metadata preservation is inherited; historical uncertain source remains visible and blocked rather than guessed.

Account-cart success envelopes are validated before adoption against the existing stored-line/source contract and a nonnegative integer revision. An incomplete reply preserves the device basket and gives a specific support code. Failed sync displays the current visible product-line count.

Order history now selects explicit customer presentation columns and validates auth epoch plus returned ownership before publication. Profile cancels obsolete reads and renders only the current identity. Loading, failed reads with read-only retry, and confirmed empty history are distinct; failed reads do not say no orders exist. Projection minimizes UI exposure without changing database privileges or claiming that a direct table request cannot select other columns.

Validation uses synthetic services, injected SDK transport and blocked external egress. The local desktop/mobile preview is for inert review. Actual disposable Auth/account-cart persistence, fresh stock bridge behavior and provider acceptance require separate scoped acceptance. Coordinate overlapping auth changes with the registration owner before a combined release. Paired Main/Admin artifact-authority SQL proposals are a separate rollout and are not included here.
