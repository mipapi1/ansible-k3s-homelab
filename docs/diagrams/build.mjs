// Renders every src/*.mmd into hand-drawn SVGs, one per theme:
//   <name>.light.svg and <name>.dark.svg
// Usage: npm ci && npm run build
//
// Nodes take their colour from a semantic class set in the .mmd file:
//   class a,b net        nodes        (gov, sec, net, data, obs, ci, muted)
//   class hub z-sec      subgraphs    (z-gov, z-sec, z-net, z-data, z-obs, z-ci)
// The classDefs themselves are appended here, per theme, so the sources stay readable.
// Shapes keep a plain fill: the hand-drawn hatching is stripped after rendering.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const only = process.argv.slice(2);

// Palette: soft fill, saturated stroke, one hue per concern.
const themes = {
  dark: {
    fg: '#f0efeb', line: '#d2d1cd', muted: '#a9a9b0',
    cluster: '#19191c', clusterLine: '#3d3d44', labelBg: '#111113',
    hues: {
      gov: ['#3a3018', '#ffc94d'], sec: ['#3d1f22', '#ff7b72'], net: ['#1b2440', '#7aa2f7'],
      data: ['#163631', '#2cc0aa'], obs: ['#2a2438', '#b39ddb'], ci: ['#3a2f1c', '#e8a83f'],
      muted: ['#222226', '#76767e'],
    },
  },
  light: {
    fg: '#1e1e1e', line: '#3b3b40', muted: '#5c5c66',
    cluster: '#fbfaf6', clusterLine: '#b9b5a8', labelBg: '#ffffff',
    hues: {
      gov: ['#fff1bf', '#c99400'], sec: ['#ffe1de', '#d64545'], net: ['#dfe7ff', '#3d63d6'],
      data: ['#d4f4ec', '#12897a'], obs: ['#ece4fa', '#7b5cc4'], ci: ['#fde7c6', '#c27a12'],
      muted: ['#efefec', '#8a8a92'],
    },
  },
};

const fontB64 = readFileSync(join(here, 'fonts/Excalifont-Regular.woff2')).toString('base64');
const fontFamily = "Excalifont, Virgil, 'Segoe Print', 'Comic Sans MS', cursive";

function classDefs(t) {
  const lines = [];
  for (const [name, [fill, stroke]] of Object.entries(t.hues)) {
    lines.push(`  classDef ${name} fill:${fill},stroke:${stroke},color:${t.fg},stroke-width:2px`);
    // Subgraphs: paper fill, coloured dashed border, coloured title.
    lines.push(`  classDef z-${name} fill:${t.cluster},stroke:${stroke},color:${stroke},stroke-width:2px,stroke-dasharray:8 5`);
  }
  return lines.join('\n');
}

function config(t) {
  return {
    look: 'handDrawn',
    handDrawnSeed: 11, // fixed seed so re-renders produce a stable diff
    theme: 'base',
    fontFamily,
    flowchart: { curve: 'basis', padding: 14, wrappingWidth: 240, nodeSpacing: 40, rankSpacing: 55, htmlLabels: true },
    themeVariables: {
      fontFamily, fontSize: '17px',
      background: 'transparent',
      primaryColor: t.hues.net[0], primaryBorderColor: t.hues.net[1], primaryTextColor: t.fg,
      secondaryColor: t.hues.muted[0], tertiaryColor: t.cluster,
      lineColor: t.line, textColor: t.fg,
      clusterBkg: t.cluster, clusterBorder: t.clusterLine, titleColor: t.fg,
      edgeLabelBackground: t.labelBg,
    },
  };
}

function css(t) {
  return `@font-face{font-family:Excalifont;src:url(data:font/woff2;base64,${fontB64}) format('woff2');}
svg{font-family:${fontFamily};}
.edgeLabel, .edgeLabel p, .edgeLabel span{color:${t.muted} !important;font-size:15px;}
.edgeLabel rect, .labelBkg{opacity:.92;}
.flowchart-link{stroke-width:1.8px !important;}
.marker, .arrowMarkerPath{fill:${t.line} !important;stroke:${t.line} !important;}
.cluster-label .nodeLabel, .cluster-label span{font-size:18px;}`;
}

// Mermaid's hand-drawn look always fills shapes with rough.js hachure (diagonal strokes in the
// fill colour), subgraphs included. Drop those strokes so shapes stay plain, with a coloured sketchy border.
function stripHatching(file, t) {
  const fills = new Set([t.cluster, ...Object.values(t.hues).map(([fill]) => fill)]);
  const svg = readFileSync(file, 'utf8').replace(/<path fill="none" stroke="(#[0-9a-f]{3,6})"[^>]*\/>/g,
    (m, stroke) => (fills.has(stroke) ? '' : m));
  writeFileSync(file, svg);
}

const src = join(here, 'src');
const files = readdirSync(src).filter((f) => f.endsWith('.mmd') && (!only.length || only.includes(basename(f, '.mmd'))));
const work = mkdtempSync(join(tmpdir(), 'diagrams-'));
const puppeteer = join(work, 'puppeteer.json');
const chrome = process.env.PUPPETEER_EXECUTABLE_PATH
  || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(existsSync);
writeFileSync(puppeteer, JSON.stringify({ headless: 'new', ...(chrome && { executablePath: chrome }), args: ['--no-sandbox'] }));

try {
  for (const f of files) {
    const name = basename(f, '.mmd');
    const body = readFileSync(join(src, f), 'utf8').trimEnd();
    for (const [themeName, t] of Object.entries(themes)) {
      const input = join(work, `${name}.${themeName}.mmd`);
      const cfg = join(work, `${themeName}.json`);
      const cssFile = join(work, `${themeName}.css`);
      writeFileSync(input, `${body}\n${classDefs(t)}\n`);
      writeFileSync(cfg, JSON.stringify(config(t)));
      writeFileSync(cssFile, css(t));
      const out = join(here, `${name}.${themeName}.svg`);
      execFileSync(join(here, 'node_modules/.bin/mmdc'),
        ['-q', '-i', input, '-o', out, '-c', cfg, '-C', cssFile, '-p', puppeteer, '-b', 'transparent'],
        { stdio: 'inherit' });
      execFileSync(join(here, 'node_modules/.bin/svgo'), ['-q', '--config', join(here, 'svgo.config.cjs'), out], { stdio: 'inherit' });
      stripHatching(out, t);
      if (process.env.PREVIEW) {
        execFileSync(join(here, 'node_modules/.bin/mmdc'),
          ['-q', '-i', input, '-o', join(work, `${name}.${themeName}.png`), '-c', cfg, '-C', cssFile, '-p', puppeteer,
            '-b', themeName === 'dark' ? '#0d1117' : '#ffffff', '-s', '1.5'], { stdio: 'inherit' });
      }
      console.log(`  ${name}.${themeName}.svg`);
    }
  }
  if (process.env.PREVIEW) console.log(`previews: ${work}`);
} finally {
  if (!process.env.PREVIEW) rmSync(work, { recursive: true, force: true });
}
