/** Diagnostic: imports the calculator, which pulls in regulation.json. */
import { exactWeapons } from '../src/calculator';

export default function handler(_req: unknown, res: { status: (n: number) => { send: (b: string) => void } }) {
  res.status(200).send(`ok: calculator runs, ${exactWeapons.length} variants`);
}
