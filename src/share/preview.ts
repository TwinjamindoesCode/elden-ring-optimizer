/**
 * Per-build link previews.
 *
 * This file is the SOURCE. It is bundled by scripts/build-shell.mjs into a
 * single self-contained api/build-meta.js, because Vercel does not bundle
 * cross-directory TypeScript imports for functions — it leaves them as runtime
 * specifiers that fail to resolve, which crashes the function on invocation.
 *
 * Crawlers do not run JavaScript, so a client-rendered page always shows the
 * same generic card no matter which build was shared. This route serves the
 * real app shell with the Open Graph tags rewritten for the specific build.
 *
 * It is reached only when someone opens a share link — normal traffic to the
 * site never touches a function.
 *
 * The numbers here are computed from the game data, not read from the URL.
 * A hand-edited link therefore cannot make the preview claim something the
 * page itself would not show.
 */

import { decodeBuild } from './build-link';
import {
  exactWeapons, getWeaponAttack, OBJECTIVE_LABELS, objectiveValue,
  type Objective,
} from '../calculator';
import { APP_SHELL } from './_shell';

const SITE = 'https://softcapbuilds.com';

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

interface Preview {
  title: string;
  description: string;
  canonical: string;
}

/** Generic fallback, used when a link carries no usable build. */
const GENERIC: Preview = {
  title: 'Softcap',
  description:
    'Softcap finds the provably optimal stat allocation for any weapon in Elden Ring. ' +
    '307 weapons, 3,296 variants, exact numbers.',
  canonical: `${SITE}/`,
};

export function previewFor(search: string): Preview {
  const build = decodeBuild(search);
  if (!build.hasBuild || !build.attributes || build.weaponName === undefined) return GENERIC;

  const weapon = exactWeapons.find(
    (w) => w.weaponName === build.weaponName && w.affinityId === build.affinityId,
  );
  if (!weapon) return GENERIC;

  const level = Math.min(build.upgradeLevel, weapon.maxUpgradeLevel);
  const result = getWeaponAttack({
    weapon,
    attributes: build.attributes,
    upgradeLevel: level,
    twoHanding: build.twoHanding,
  });

  const objective = build.objective as Objective;
  const headline = Math.floor(objectiveValue(result.attackPower, objective));
  const metric = OBJECTIVE_LABELS[objective] ?? 'Attack power';

  // Use the game's own display name. Affinity is not always a simple prefix —
  // "Bloodfiend's Arm" with Blood becomes "Bloodfiend's Blood Arm", not
  // "Blood Bloodfiend's Arm".
  const displayName = weapon.name;

  const a = build.attributes;
  const spread = `STR ${a.str} · DEX ${a.dex} · INT ${a.int} · FTH ${a.fai} · ARC ${a.arc}`;
  const grip = build.twoHanding ? 'two-handed' : 'one-handed';

  return {
    title: `${displayName} +${level} — RL${build.targetLevel} — Softcap`,
    description:
      `${headline} ${metric.toLowerCase()} at runelevel ${build.targetLevel}, ${grip}. ` +
      `${spread}. Exact numbers from the game's own data.`,
    canonical: `${SITE}/b?${new URLSearchParams(search).toString()}`,
  };
}

/** Replaces the shell's existing title and og/twitter tags with build-specific ones. */
export function renderShell(search: string): string {
  const { title, description, canonical } = previewFor(search);
  const t = escapeHtml(title);
  const d = escapeHtml(description);
  const c = escapeHtml(canonical);

  let html = APP_SHELL;

  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${t}</title>`);
  html = html.replace(
    /<meta\s+name="description"[^>]*>/,
    `<meta name="description" content="${d}" />`,
  );
  html = html.replace(
    /<link\s+rel="canonical"[^>]*>/,
    `<link rel="canonical" href="${c}" />`,
  );

  const swap = (attr: 'property' | 'name', key: string, value: string) => {
    const re = new RegExp(`<meta\\s+${attr}="${key}"[^>]*>`);
    const tag = `<meta ${attr}="${key}" content="${value}" />`;
    html = re.test(html) ? html.replace(re, tag) : html.replace('</head>', `    ${tag}\n  </head>`);
  };

  swap('property', 'og:title', t);
  swap('property', 'og:description', d);
  swap('property', 'og:url', c);
  swap('name', 'twitter:title', t);
  swap('name', 'twitter:description', d);

  return html;
}

export default function handler(
  req: { url?: string },
  res: {
    setHeader: (k: string, v: string) => void;
    status: (n: number) => { send: (b: string) => void };
  },
) {
  const search = (req.url ?? '').split('?')[1] ?? '';
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  // Previews are deterministic for a given link, so let the CDN serve repeats.
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=86400, stale-while-revalidate=604800');
  res.status(200).send(renderShell(search));
}
