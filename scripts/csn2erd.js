#!/usr/bin/env node
'use strict'
/*
 * csn2erd.js — CDS/CSN -> ER diagram, Node-only (no SQL, no Python).
 *
 * Reads the model via the @sap/cds compiler API and emits either the
 * drawio-skill graph JSON (for autolayout.py) or, with --to drawio, a
 * positioned .drawio directly using a built-in layered layout — so the whole
 * CAP ER workflow is a single Node step with no Python in the path.
 *
 * Keeps the semantics SQL drops: key elements, associations AND compositions,
 * cardinality (crow's-foot ends), composition-vs-association (identifying/
 * diamond vs non-identifying/dashed), code lists, and remote/reuse targets.
 *
 * Usage (run from inside the CAP project so @sap/cds resolves):
 *   node csn2erd.js db/schema.cds [more.cds ...] [--only <prefix>]
 *        [--to json|drawio] [-o out]
 *
 *   --only <prefix>   render only entities under <prefix> (e.g.
 *                     sap.capire.travels); assoc targets outside become
 *                     dashed "external" stub nodes.
 *   --to json|drawio  output format (default json). "drawio" lays out and
 *                     emits .drawio directly — no Graphviz, no autolayout.py.
 *   -o <file>         write here instead of stdout.
 */
const path = require('path')
const { createRequire } = require('module')
const cds = createRequire(path.join(process.cwd(), 'package.json'))('@sap/cds')

// Styles mirror the skill's ERD preset (references/diagram-types.md).
const TABLE = 'rounded=0;whiteSpace=wrap;html=1;align=left;verticalAlign=top;spacingLeft=6;spacingTop=4;fillColor=#dae8fc;strokeColor=#6c8ebf;'
const EXTERNAL = 'rounded=1;whiteSpace=wrap;html=1;dashed=1;align=left;verticalAlign=top;spacingLeft=6;spacingTop=4;fillColor=#f5f5f5;strokeColor=#666666;'
const CODELIST = 'rounded=0;whiteSpace=wrap;html=1;align=left;verticalAlign=top;spacingLeft=6;spacingTop=4;fillColor=#d5e8d4;strokeColor=#82b366;'
const E = 'edgeStyle=entityRelationEdgeStyle;html=1;rounded=0;fontSize=11;labelBackgroundColor=#ffffff;'
const E_ASSOC_N = E + 'dashed=1;startArrow=ERone;startFill=0;endArrow=ERmany;endFill=0;'   // 1 -> many
const E_ASSOC_1 = E + 'dashed=1;startArrow=ERmany;startFill=0;endArrow=ERone;endFill=0;'   // many -> 1
const E_COMPOS  = E + 'startArrow=diamondThin;startFill=1;endArrow=ERmany;endFill=0;'       // owner <>-- many

const short = n => n.split('.').pop()
const typeName = e => (e.type || '').replace(/^cds\./, '') || 'assoc'
const isAssoc = e => e.type === 'cds.Association' || e.type === 'cds.Composition'
const toMany = e => !!(e.cardinality && (e.cardinality.max === '*' || e.cardinality.max > 1))
const skip = n => /\.texts$/.test(n) || /DraftAdministrativeData$/.test(n)

let model
// Disambiguate the inline-composition collision (…Bookings.Supplements vs a
// remote Supplements): prefix with the parent segment when the parent is an entity.
function label(name) {
  const parent = name.split('.').slice(0, -1).join('.')
  const d = model.definitions[parent]
  return d && d.kind === 'entity' ? short(parent) + '.' + short(name) : short(name)
}

function size(lines) {
  return {
    width: Math.max(160, Math.ceil(Math.max(...lines.map(l => 7 * l.length + 30)) / 10) * 10),
    height: Math.ceil((30 + 20 * (lines.length - 1)) / 10) * 10,
  }
}

function extract(only) {
  const wanted = n => !only || n.startsWith(only)
  const nodes = [], raw = [], seen = new Set(), external = new Set()

  for (const [name, def] of Object.entries(model.definitions)) {
    if (def.kind !== 'entity' || skip(name) || !wanted(name)) continue
    seen.add(name)
    const codeList = def.includes && def.includes.some(i => /CodeList$/.test(i))
    const lines = [label(name)]
    for (const [col, el] of Object.entries(def.elements || {})) {
      if (isAssoc(el)) {
        if (!wanted(el.target)) external.add(el.target)
        raw.push({ source: name, target: el.target, label: col,
                   comp: el.type === 'cds.Composition', many: toMany(el) })
        continue
      }
      if (el['@cds.on.insert'] || el['@cds.on.update']) continue   // skip managed aspect fields
      lines.push(`${el.key ? 'PK ' : ''}${col}: ${typeName(el)}`)
    }
    nodes.push({ id: name, label: lines.join('\n'), style: codeList ? CODELIST : TABLE, ...size(lines) })
  }
  for (const t of external) {
    if (seen.has(t)) continue
    const l = [label(t), `(external: ${t.split('.').slice(0, -1).join('.')})`]
    nodes.push({ id: t, label: l.join('\n'), style: EXTERNAL, ...size(l) })
    seen.add(t)
  }

  // Backlink filtering: drop an association that is just the reverse of a
  // composition (parent key / generated up_ link); keep the forward composition.
  const comp = new Set(raw.filter(e => e.comp).map(e => `${e.source}->${e.target}`))
  const edges = raw
    .filter(e => seen.has(e.target))
    .filter(e => e.comp || !comp.has(`${e.target}->${e.source}`))
    .map(e => ({ source: e.source, target: e.target, label: e.label,
                 style: e.comp ? E_COMPOS : (e.many ? E_ASSOC_N : E_ASSOC_1) }))
  return { nodes, edges }
}

// Built-in layered layout — longest-path layering + barycenter crossing
// reduction (down/up sweeps). Replaces Graphviz for the --to drawio path.
function layout(nodes, edges) {
  const byId = Object.fromEntries(nodes.map(n => [n.id, n]))
  const rank = Object.fromEntries(nodes.map(n => [n.id, 0]))
  for (let i = 0; i < nodes.length; i++) {
    let changed = false
    for (const e of edges) {
      if (e.source === e.target || !byId[e.source] || !byId[e.target]) continue
      if (rank[e.target] < rank[e.source] + 1) { rank[e.target] = rank[e.source] + 1; changed = true }
    }
    if (!changed) break
  }
  const rows = {}
  for (const n of nodes) (rows[rank[n.id]] ||= []).push(n)
  const ranks = Object.keys(rows).map(Number).sort((a, b) => a - b)

  // Undirected adjacency + barycenter ordering within each rank.
  const nbr = Object.fromEntries(nodes.map(n => [n.id, []]))
  for (const e of edges) if (byId[e.source] && byId[e.target] && e.source !== e.target) {
    nbr[e.source].push(e.target); nbr[e.target].push(e.source)
  }
  const pos = {}
  const reindex = () => { for (const r of ranks) rows[r].forEach((n, i) => (pos[n.id] = i)) }
  reindex()
  for (let it = 0; it < 8; it++) {
    for (const r of (it % 2 ? [...ranks].reverse() : ranks)) {
      const bary = n => (nbr[n.id].length ? nbr[n.id].reduce((s, m) => s + pos[m], 0) / nbr[n.id].length : pos[n.id])
      rows[r] = rows[r].map(n => [n, bary(n)]).sort((a, b) => a[1] - b[1]).map(x => x[0])
      rows[r].forEach((n, i) => (pos[n.id] = i))
    }
  }

  const HGAP = 70, VGAP = 100
  const rowW = r => rows[r].reduce((s, n) => s + n.width, 0) + HGAP * (rows[r].length - 1)
  const maxW = Math.max(...ranks.map(rowW))
  let y = 40
  for (const r of ranks) {
    let x = 40 + Math.round((maxW - rowW(r)) / 2)
    for (const n of rows[r]) { n.x = Math.round(x / 10) * 10; n.y = Math.round(y / 10) * 10; x += n.width + HGAP }
    y += Math.max(...rows[r].map(n => n.height)) + VGAP
  }
  return nodes
}

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/\n/g, '&#xa;')

function toDrawio({ nodes, edges }) {
  layout(nodes, edges)
  const cells = []
  for (const n of nodes) cells.push(
    `        <mxCell id="${esc(n.id)}" value="${esc(n.label)}" style="${n.style}" vertex="1" parent="1">\n` +
    `          <mxGeometry x="${n.x}" y="${n.y}" width="${n.width}" height="${n.height}" as="geometry" />\n` +
    `        </mxCell>`)
  let i = 0
  for (const e of edges) cells.push(
    `        <mxCell id="e${i++}" value="${esc(e.label)}" style="${e.style}" edge="1" parent="1" source="${esc(e.source)}" target="${esc(e.target)}">\n` +
    `          <mxGeometry relative="1" as="geometry" />\n` +
    `        </mxCell>`)
  return `<?xml version="1.0" encoding="UTF-8"?>\n<mxfile host="drawio" version="26.0.0">\n  <diagram name="ER">\n` +
    `    <mxGraphModel dx="900" dy="700" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1100" pageHeight="950" math="0" shadow="0">\n` +
    `      <root>\n        <mxCell id="0" />\n        <mxCell id="1" parent="0" />\n${cells.join('\n')}\n      </root>\n    </mxGraphModel>\n  </diagram>\n</mxfile>\n`
}

async function main() {
  const argv = process.argv.slice(2)
  let only = null, out = null, to = 'json'
  const files = []
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--only') only = argv[++i]
    else if (argv[i] === '-o' || argv[i] === '--output') out = argv[++i]
    else if (argv[i] === '--to') to = argv[++i]
    else files.push(argv[i])
  }
  if (!files.length) { console.error('usage: node csn2erd.js <model.cds...> [--only prefix] [--to json|drawio] [-o file]'); process.exit(2) }

  model = cds.linked(await cds.load(files))
  const { nodes, edges } = extract(only)
  const text = to === 'drawio' ? toDrawio({ nodes, edges })
    : JSON.stringify({ direction: 'TB', nodes, edges }, null, 2) + '\n'
  if (out) { require('fs').writeFileSync(out, text); console.error(`wrote ${out}`) }
  else process.stdout.write(text)
  console.error(`${nodes.length} entities, ${edges.length} relationships (${to})`)
}

main().catch(e => { console.error(e.message || e); process.exit(1) })
