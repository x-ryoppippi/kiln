# Contributing

## Development

The Nix dev shell (`nix develop`, or direnv with `.envrc`) provides Node.js, pnpm, Vite+ and `just`, and installs the dependencies.

```sh
just check   # format, lint and type-check
just test    # unit and integration tests
just build   # the package and every example
just bench   # what each example ships, with and without extract
```

CI runs `just check test build`. Commits follow Conventional Commits.

## Releasing

`@nishikijs/react` is published from GitHub Actions by [`.github/workflows/release.yml`](./.github/workflows/release.yml) through npm trusted publishing (OIDC), with provenance. No npm token is stored anywhere.

1. Set `version` in `packages/nishiki/package.json` and move the CHANGELOG's Unreleased entries under that version. Merge it to `main`.
2. Create a GitHub release from `main` with the tag `v<version>`, such as `v0.1.0`, and publish it.
3. The workflow runs in the `npm` environment, checks that the tag matches the package version, runs `just check test build`, packs the package with pnpm (which applies `publishConfig`), and publishes the tarball with `npm publish --provenance --access public`.

The workflow file name and the environment are what npm trusts, so keep them as they are. The trusted publisher was set up with:

```sh
npm trust github @nishikijs/react --file release.yml --repo x-ryoppippi/nishiki --env npm
```
