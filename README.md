# cds-erd — CDS → draw.io ER diagram (Claude Code skill)

A [Claude Code](https://docs.claude.com/en/docs/claude-code) skill that generates an **editable draw.io (`.drawio`) entity-relationship diagram** directly from a [SAP CAP](https://cap.cloud.sap/) / CDS data model — Node-only, no SQL, no Python.

It reads the model through the `@sap/cds` compiler API (CSN), so it keeps what the `cds compile --to sql` route throws away: `key` elements, **associations vs compositions**, cardinality, code lists, and remote/reuse targets.

## Why not SQL?

`cds compile --to sql` drops foreign-key constraints and all association/composition semantics — associations become bare `_ID` columns, so a SQL-based ER importer produces tables with **no relationship edges**. SQL is a lossy intermediate for CAP. This skill works from CSN instead.

## Install

Clone into your personal skills directory (Claude Code: `~/.claude/skills`):

```bash
git clone https://github.com/nkaputnik/cds-erd-drawio-skill.git ~/.claude/skills/cds-erd
```

Then reload skills in Claude Code (`/reload-skills`). The skill triggers when you ask for an ER / data-model diagram of a CAP project or a `.cds` schema.

## Usage

Run from inside the CAP project (so `@sap/cds` resolves):

```bash
node ~/.claude/skills/cds-erd/scripts/csn2erd.js <model.cds ...> [--only <prefix>] [--to json|drawio] [-o out]
```

| Flag | Meaning |
|------|---------|
| `--to drawio` | Emit a positioned `.drawio` directly (built-in layered + barycenter layout, no Graphviz). **Recommended.** |
| `--to json` *(default)* | Emit graph JSON for a Graphviz autolayout step when you want `dot`-grade layout. |
| `--only <prefix>` | Render only entities under a namespace (e.g. `sap.capire.travels`); association targets outside become dashed external stubs. |
| `-o <file>` | Write to a file instead of stdout. |

Run the script with no arguments for usage.

### Example

```bash
cd my-cap-project
node ~/.claude/skills/cds-erd/scripts/csn2erd.js db/schema.cds --only sap.capire.travels --to drawio -o er.drawio
# -> 11 entities, 10 relationships (drawio)
```

## Choosing the layout path (coexistence with the drawio skill)

This skill is **standalone** — the script never calls another skill. But it has two outputs, and the better one depends on what else is installed:

- **If a draw.io skill with `autolayout.py` is installed AND Graphviz `dot` is on PATH** → run `--to json`, then hand the graph JSON to that skill's `autolayout.py` for `dot`-grade layout (and its validation/export if available). Check with `command -v dot` and `ls ~/.claude/skills/*/scripts/autolayout.py`.
- **Otherwise** → use `--to drawio` (built-in Node layout, zero extra deps).

This is an orchestration choice, not a code dependency: `cds-erd` produces a complete `.drawio` on its own, and simply upgrades to Graphviz layout when those tools happen to be present.

## What it captures

- `key` → PK rows; scalar elements → typed columns (managed `createdAt`/`createdBy`/… filtered out).
- Composition → solid line, filled diamond at the owner; association → dashed crow's-foot.
- Cardinality → crow's-foot ends (to-one vs to-many).
- `CodeList` entities → green boxes; targets outside `--only` → grey dashed external stubs.
- Composition backlinks (`up_`, parent key assoc) filtered to avoid duplicate reverse edges.
- Inline-composition names disambiguated (e.g. `Bookings.Supplements`).

## Dependencies

- **Node** + **`@sap/cds`** — run inside a CAP project.
- *Optional:* [draw.io](https://www.drawio.com/) desktop/CLI for PNG/SVG/PDF export and a final libavoid reroute; Graphviz `dot` only for the `--to json` autolayout path.

## Note on layout

The built-in layered layout is a good **draft** — it orders nodes (barycenter crossing-reduction) but does not route edges. For a print-perfect result, open the `.drawio` in draw.io desktop (libavoid reroute) or use the Graphviz `--to json` path.
