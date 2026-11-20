# Nested real catalogue folders — local paired change

The quick-add control resolves the deepest selected real folder by its complete
ID path. It has no first-category fallback and no target for catalogue views such
as Just Added, Specials or Uncategorised. Row-menu add still uses the clicked node.
The existing owner-only API remains the write boundary.

Ordinary taxonomy nodes remain ordinary persisted nodes. The generated Motarro
branch remains derived from the ordinary tree. Manual descendants of any real
folder in that generated branch are stored as an additive versioned overlay in
`site-config/taxonomy/categories.json`:

```json
{
  "categories": [],
  "generatedTaxonomy": {
    "version": 1,
    "hiddenIds": [],
    "nodes": [
      {"path": ["mottaro", "mottaro-art-supplies", "manual-sets"], "label": "Sets", "order": 1}
    ]
  }
}
```

The example illustrates the shape, not an initialization or production payload.
The existing storage writer supplies `updatedAt`. The overlay records full stable
ID paths and manual sibling order, never copied automatic subtrees. IDs are globally
unique, hidden descendants keep their reserved IDs, and each parent must resolve
in the canonical or already validated manual tree. Duplicate labels, corrupt
versions, forged automatic edits and orphaning replacements hold instead of guessing.
Legacy leaves without `children` and historical duplicate-ID trees remain readable; ambiguous targets and any new write retaining duplicate IDs are held until explicit repair. New persisted nodes are validated.

Admin and storefront use byte-identical schema/merge helpers and generator code.
Manual nodes are marked `manualGenerated` in the materialized tree. Automatic label
and fuzzy inference ignores these nodes, so adding an empty manual folder does not
capture existing products. Existing explicit additional placements can populate
manual folders; storefront browsing/counts recognize those paths without replacing
the primary/inferred group. No product is reassigned when a folder is created.
Manual folders with no positive count stay hidden in desktop/mobile menus, including
mobile's unknown-count path. Existing ordinary navigation behavior stays unchanged.

Versioned add/replace/rename/delete/hide/restore all check the current taxonomy
revision; mutation construction uses that same fresh snapshot. Manual metadata
rename keeps IDs and placement membership stable, with no primary-label rewrite.
Manual deletion uses the existing archive behavior on explicitly placed live SKUs
and any validated stored Motarro path, never on the entire automatic parent.
A regular source deletion that would orphan a manual subtree is held until that
manual subtree is explicitly removed. Whole-tree reorder preserves manual positions;
it cannot silently drop manual folders or edit/delete automatic nodes. Automatic
hide/restore remains the explicit generated-node flow.

After a versioned edit, generated hidden IDs and manual descendants share one
JSON write and updatedAt. The historical hidden-ID file is read-only fallback for
legacy documents. Missing authoritative taxonomy storage holds mutations; read
fallbacks show ordinary bundled categories without recreating a generated branch
whose hidden state is unknown. Invalid overlays fail closed.

Release requirements: review both repository patches and test them together with
isolated bindings. Deploy paired readers before permitting the first new-format
write; retire old taxonomy writers that discard overlay/hidden metadata. This is
an additive JSON contract, not a database migration. No migration, shared setting,
flag change or real product edit was performed locally. No public upload or release
is authorized by this preparation.

Storage's existing read/compare/upsert optimistic locking is retained; this does
not introduce a cross-instance CAS or a transaction joining taxonomy and product
archive RPCs. Checks reject a stale revision before archive side effects and
recheck before save, but no distributed atomicity guarantee is claimed. Keep a
compatible reader/writer (or read-only taxonomy) on rollback after new-format writes;
do not roll back to a writer that strips the new document fields.

Before release, validate the actual stored taxonomy shape/IDs read-only. No automatic
repair or deduplication of existing folders/products is part of this change.
