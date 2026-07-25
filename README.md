# Synthetiq Module Tester

Safe, local static contract inspection for Synthetiq Player module ZIPs.

This project checks package structure, a V3 manifest, JavaScript syntax,
required `globalThis` handler exports, and common stream-shape mistakes. It
does **not** execute module code, visit source websites, make media requests,
import anything into Flutter, or prove playback.

## Install

```bash
git clone https://github.com/kas021/synthetiq-module-tester.git
cd synthetiq-module-tester
npm install
```

## Test a module

```bash
node bin/synthetiq-module-tester.js /absolute/path/to/module.zip --json
```

Interpret the result honestly:

- `PASS` means the static contract inspection passed.
- `CONTRACT_ONLY` means playback is **not** verified.
- `PLAYBACK_UNVERIFIED` remains the correct status until an authorised source
  has passed the real Synthetiq Player runtime test.
- `FAIL` means fix the ZIP before import.

## Agent handoff rule

An agent must report the exact command and output. It must never call a video
module playable solely because this tool passed, because search/details/episode
data is not playback evidence.

For the full module contract and evidence rules, read:

https://synthetiq.uk/modules/guide/

## Safety boundary

This is deliberately a local, static inspector. It does not accept remote ZIP
uploads, execute arbitrary module code, make network requests, collect
credentials, or bypass access controls. Use it only for sources you own,
control, or are explicitly authorised to integrate.

## Development

```bash
npm test
```

## License

MIT
