# Publishing `@nombaone/node` to npm

Releases are **automated and merge-triggered**. You never build, test, tag, or
upload by hand — a GitHub Actions workflow
([`.github/workflows/release.yml`](.github/workflows/release.yml)) runs on every
merge to `main`, and publishes to npm **only when the version number is new**.
Your only jobs are the few one-time setup items below, then a one-line change per
release.

---

## One-time setup (~15 min, do these once ever)

- [ ] **Make an npm account** at <https://www.npmjs.com/signup> and turn on
      2-factor auth (Settings → Two-Factor Authentication — required to publish).
- [ ] **Own the `@nombaone` scope.** Create the npm organization at
      <https://www.npmjs.com/org/create> named exactly **`nombaone`** (the free
      plan is fine — public packages only). The package name `@nombaone/node`
      lives inside this org, as will every future JS package we ship.
- [ ] **Put the code on GitHub.** The repo currently lives at
      <https://github.com/emekaorji/nombaone-node>, and `package.json` →
      `repository.url` points there. **These two must always match** — npm's
      provenance check rejects the publish otherwise (it verifies the repo the
      workflow actually ran in against the manifest). If you later transfer the
      repo to the `nombaone` org, update `repository.url` in `package.json` and
      the Trusted Publisher entry in the same change.
- [ ] **First publish only — add a temporary token.** npm can only attach
      tokenless publishing to a package that already exists, so the very first
      version ships with a token. First, on npmjs.com go to _Access Tokens →
      Generate New Token → Granular_, allow **Read and write** for _Packages_
      (30-day expiry is fine), and copy it. Then, on the GitHub repo, go to
      _Settings → Secrets and variables → Actions → New repository secret_,
      name it exactly **`NPM_TOKEN`**, and paste the token.
- [ ] **Merge to `main`** (or just push). Watch _Actions → Release_ go green —
      that run publishes `@nombaone/node@0.1.0`.
- [ ] **Switch to tokenless publishing (Trusted Publishing).** On
      <https://www.npmjs.com/package/@nombaone/node/access>, under _Trusted Publisher_,
      choose GitHub Actions and enter exactly: Organization or user `emekaorji` ·
      Repository `nombaone-node` · Workflow filename `release.yml`. (If the repo
      moves to the `nombaone` org later, update this entry to match.)
- [ ] **Delete the token.** Remove the `NPM_TOKEN` secret from GitHub and revoke
      the token on npmjs.com. From now on publishing is tokenless — nothing to
      leak, nothing to rotate.

---

## To ship a release (every time)

- In [`package.json`](package.json), change the one line
  `"version": "0.1.0"` to the new number (`0.1.1` for a fix, `0.2.0` for
  features), and merge it to `main` (directly or via PR).

That's the whole release. On merge, GitHub runs the full test gate, builds, and
uploads the new version to npm automatically. Watch the **Release** run go green
under _Actions_ (~2 min); within a minute of green, `npm install @nombaone/node`
serves it.

Merges that don't change the version publish nothing — the workflow sees the
version already exists on npm and skips the upload. And if any test fails,
nothing is published.

---

## After the first publish: the clean-room check (once per release, ~2 min)

From any folder on any machine:

```bash
mkdir /tmp/nombaone-check && cd /tmp/nombaone-check
npm init -y >/dev/null && npm install @nombaone/node
NOMBAONE_API_KEY=nbo_sandbox_… node --input-type=module -e "
import Nombaone from '@nombaone/node';
const n = new Nombaone(process.env.NOMBAONE_API_KEY);
const c = await n.customers.create({ email: 'check+' + Date.now() + '@example.com', name: 'Clean Room' });
console.log('published package works:', c.id);
"
```

Seeing `published package works: nbo…cus` means the version on npm installs
clean and talks to the real sandbox.

---

## If a release run fails (rare)

Open the failed **Release** run under _Actions_ and read the red step:

- **A failing lint/test step** — the code is red; send the run link to
  engineering. Nothing was published.
- **`npm publish` failed with 401/403** — the one-time Trusted Publisher isn't
  set up (or its org/repo/workflow fields don't match `nombaone` /
  `nombaone-node` / `release.yml`), and no `NPM_TOKEN` secret exists. Recheck
  the setup list above.
- **`npm publish` failed with 402/`payment required`** — the package tried to
  publish as private; it shouldn't (the workflow passes `--access public`), send
  the run link to engineering.

> Note: you can't overwrite a version on npm. To fix a bad release, bump to the
> next number and merge again — never reuse a number.
