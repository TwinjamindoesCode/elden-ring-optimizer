/** Diagnostic: no imports at all. Tells us whether functions work in principle. */
export default function handler(_req: unknown, res: { status: (n: number) => { send: (b: string) => void } }) {
  res.status(200).send('ok: bare function runs');
}
