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
| `--to drawio` | Write a ready-to-open diagram directly, arranged by the built-in layout. **Recommended — needs nothing extra.** |
| `--to json` *(default)* | Write the raw diagram data as JSON instead, so a separate tool can arrange it. Only needed for the optional tidier-layout path described below. |
| `--only <prefix>` | Render only entities under a namespace (e.g. `sap.capire.travels`); association targets outside become dashed external stubs. |
| `-o <file>` | Write to a file instead of stdout. |

Run the script with no arguments for usage.

### Example

```bash
cd my-cap-project
node ~/.claude/skills/cds-erd/scripts/csn2erd.js db/schema.cds --only sap.capire.travels --to drawio -o er.drawio
# -> 11 entities, 10 relationships (drawio)
```

## How tidy is the diagram?

`cds-erd` always produces a complete, editable diagram by itself — you never *need* anything else installed. The only thing that varies is how neatly the boxes are arranged for you:

- **On its own (`--to drawio`):** a simple built-in arrangement. Perfectly usable, but on busier models some connector lines may cross. Think of it as a good first draft — open it in draw.io and nudge a few boxes if you want it perfect.
- **With the companion draw.io skill (`--to json`):** if you also have the [draw.io skill by Agents365-ai](https://github.com/Agents365-ai/drawio-skill) installed, plus **Graphviz** — a free, widely used tool that arranges diagrams automatically ([graphviz.org](https://graphviz.org)) — the boxes come out noticeably tidier with no manual nudging.

**You don't have to choose.** When you run `cds-erd` through Claude Code, it looks for that draw.io skill and Graphviz; if both are present it automatically switches to `--to json` and hands the diagram over for the tidier layout, otherwise it arranges the diagram itself. Either way you end up with a finished, editable diagram.

To check whether Graphviz is already on your machine, run `dot -V` in a terminal (`dot` is Graphviz's command). If it prints a version, you have it. On a Mac, install it with `brew install graphviz`. If you'd rather not bother, the built-in arrangement is always there.

## What it captures

- `key` → PK rows; scalar elements → typed columns (managed `createdAt`/`createdBy`/… filtered out).
- Composition → solid line, filled diamond at the owner; association → dashed crow's-foot.
- Cardinality → crow's-foot ends (to-one vs to-many).
- `CodeList` entities → green boxes; targets outside `--only` → grey dashed external stubs.
- Composition backlinks (`up_`, parent key assoc) filtered to avoid duplicate reverse edges.
- Inline-composition names disambiguated (e.g. `Bookings.Supplements`).

## Dependencies

- **Node** + **`@sap/cds`** — run inside a CAP project. That's all you need.
- *Optional, for the tidier layout:* the [draw.io skill by Agents365-ai](https://github.com/Agents365-ai/drawio-skill) + [Graphviz](https://graphviz.org). `cds-erd` hands off to them automatically when both are present.
- *Optional, to view/export:* [draw.io](https://www.drawio.com/) to open the diagram and export PNG, SVG, or PDF.
