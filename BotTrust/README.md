# BotTrust

BotTrust is a standalone, stateless command-line helper for explicit probability decisions and weighted random selection. It uses Python's operating-system-backed `secrets` source; it does not claim hardware or quantum randomness.

## Entry points

From the PodleTools repository:

```bash
BotTrust/bin/bot-trust 70%
printf '1 | red\n3 | blue\n' | BotTrust/bin/bot-trust select -
BotTrust/bin/bot-trust tree choices.txt
BotTrust/bin/bot-trust-filter 'flip a coin with a 70% chance'
```

`bin/bot-trust` is the stable entry point. It prints `0` or `1` in probability mode and the selected outcome in `select` or `tree` mode. Add `BotTrust/bin` to `PATH` or symlink the entry points into a directory already on `PATH` for use outside this checkout.

`bin/bot-trust-filter` is optional natural-language intake. Its matching expressions are kept separately in the declarative `config/natural-language-filters.json` file. Non-matches exit with status 1 and no output.

Both scripts resolve their files relative to their installation directory. They have no Firstmate checkout or home-directory dependency. Requirements are Bash and Python 3.

## Input formats

Probability input is a number from 0 through 100 with an optional percent sign, or a small English number such as `seventy five percent`.

Weighted selection files contain one positive `weight | outcome` per line. Blank lines and `#` comments are ignored. Tree files use `>` prefixes for child depth:

```text
1 | concise
3 | detailed
> 1 | example A
> 1 | example B
```

## Safety boundary

BotTrust may vary wording or surface ideas. Randomness must never decide or bypass:

- safety checks
- spending or purchases
- destructive actions
- credential or security-sensitive choices
- merge authority or other required approval

The tool does not track state or invocation frequency. It includes no Frequency Governor and no Hermes or MCP wiring.

## Agent skill

A reusable skill is included at `skill/bot-trust/SKILL.md`. Copy that directory into an agent's supported skill location if desired, and adjust its entry-point path for the installation.

## Tests

```bash
BotTrust/tests/bot-trust.test.sh
```

Tests use a private randomness injection intended only to make assertions deterministic.

## Provenance

Adapted from Firstmate's landed `fm-bot-trust.sh`, `fm-bot-trust-filter.sh`, tests, and Bot Trust skill. This copy is self-contained and does not modify or depend on Firstmate.
