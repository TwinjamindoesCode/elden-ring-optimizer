/** Diagnostic: imports the share decoder only — no game data. */
import { decodeBuild } from '../src/share/build-link';

export default function handler(req: { url?: string }, res: { status: (n: number) => { send: (b: string) => void } }) {
  const b = decodeBuild((req.url ?? '').split('?')[1] ?? '');
  res.status(200).send(`ok: decoder runs, level=${b.targetLevel} hasBuild=${b.hasBuild}`);
}
