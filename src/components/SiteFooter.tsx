const REPO = 'https://github.com/TwinjamindoesCode/elden-ring-optimizer';

/**
 * Credits and the fan-project disclaimer.
 *
 * The attack-power data and formula come from a third party under MIT, which
 * requires the notice to travel with the work. LICENSE-THIRDPARTY.md carries
 * the full text; this puts the credit somewhere people actually see it.
 */
export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-grid">
        <section className="footer-block">
          <h2>Data</h2>
          <p>
            Weapon attack power, scaling coefficients and upgrade multipliers come from
            Elden Ring&rsquo;s regulation data, extracted and published by{' '}
            <a
              href="https://github.com/ThomasJClark/elden-ring-weapon-calculator"
              target="_blank"
              rel="noreferrer noopener"
            >
              elden-ring-weapon-calculator
            </a>{' '}
            by Tom Clark (MIT). The attack-power calculation here is a port of that
            project&rsquo;s implementation.
          </p>
          <p>
            Item names, descriptions, armor stats and spell data come from the{' '}
            <a href="https://eldenring.fanapis.com/" target="_blank" rel="noreferrer noopener">
              Elden Ring Fan API
            </a>
            .
          </p>
        </section>

        <section className="footer-block">
          <h2>Accuracy</h2>
          <p>
            Weapon attack power is verified against known in-game values, and the stat
            solver is checked against brute force over every possible allocation. Armor
            numbers come from the fan API and have not been verified the same way.
          </p>
          <p>
            <a href={`${REPO}/issues`} target="_blank" rel="noreferrer noopener">
              Found a wrong number? Open an issue
            </a>
            {' · '}
            <a href={REPO} target="_blank" rel="noreferrer noopener">
              Source on GitHub
            </a>
          </p>
        </section>
      </div>

      <p className="footer-legal">
        Softcap is an unofficial fan project. Elden Ring is a trademark of FromSoftware,
        Inc. and Bandai Namco Entertainment Inc. This site is not affiliated with, endorsed
        by, or sponsored by either company.
      </p>
    </footer>
  );
}
