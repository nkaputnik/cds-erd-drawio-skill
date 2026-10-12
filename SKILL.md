---
name: cds-erd
description: Use when you need an entity-relationship (ER) diagram of a CAP / CDS data model — visualizing CSN entities, keys, associations, and compositions as an editable draw.io (.drawio) diagram, or turning a schema.cds / CSN into a diagram. Technology-specific to SAP CAP (Node).
---

# CDS → ER diagram (draw.io)

## Overview

Generate an editable **draw.io** ER diagram directly from a CAP/CDS model, Node-only. Reads the model through the `@sap/cds` compiler API (CSN), so it keeps what SQL throws away: `key` elements, **associations vs compositions**, cardinality, code lists, and remote/reuse targets. No SQL, no Python in the path.

## When to use

- Asked for an ER / data-model diagram of a CAP project or a `.cds` schema.
- Want an editable `.drawio` (not a flattened image) of entities and their relationships.
- NOT for non-CAP SQL schemas — for raw `CREATE TABLE` DDL use a generic ER tool. The `cds compile --to sql` route is lossy for CAP (drops FK constraints and all association/composition semantics), so prefer this CSN-native path.

## Quick reference

Run from inside the CAP project (so `@sap/cds` resolves):

```bash
node scripts/csn2erd.js <model.cds ...> [--only <prefix>] [--to json|drawio] [-o out]
```

- `--to drawio` (recommended): emits a positioned `.drawio` directly with a built-in layered + barycenter layout. No Graphviz.
- `--to json` (default): emits graph JSON for a Graphviz autolayout step (e.g. the `drawio-skill`'s `autolayout.py`) when you want `dot`-grade layout.
- `--only <prefix>`: render only entities under a namespace (e.g. `sap.capire.travels`); association targets outside the prefix become dashed external stubs.
- `-o <file>`: write to a file instead of stdout.

Run `node scripts/csn2erd.js` with no args for usage.

## What it captures

- `key` → PK rows; scalar elements → typed columns (managed `createdAt`/`createdBy`/… filtered out).
- Composition → solid line, filled diamond at the owner; association → dashed crow's-foot.
- Cardinality → crow's-foot ends (to-one vs to-many).
- `CodeList` entities → green boxes; targets outside `--only` → grey dashed external stubs.
- Composition backlinks (`up_`, parent key assoc) filtered to avoid duplicate reverse edges.
- Inline-composition names disambiguated (e.g. `Bookings.Supplements`).

## Dependencies

- Node + `@sap/cds` — run inside a CAP project.
- Optional: draw.io desktop/CLI for PNG/SVG/PDF export and a final libavoid re-route; Graphviz `dot` only for the `--to json` autolayout path.

## Common mistakes

- Running outside a CAP project → `@sap/cds` not found. `cd` to the project root first.
- Expecting print-perfect layout — the built-in layout is a good *draft*. Open in draw.io desktop (libavoid reroute) or use the Graphviz path for final polish.
