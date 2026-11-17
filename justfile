# Task runner. Run `just --list` to see everything.

[private]
default:
    @just --list

# Install the JS dependencies needed to work in this repository
install:
    vp install --frozen-lockfile
    # The dev shell re-installs when the lockfile is newer than this stamp.
    touch node_modules/.install-stamp

# Build every package and every example, with and without extract, the lazy-routes examples' single-sheet, compact-name, Rollup and Rolldown builds, lazy-routes' webpack, Rspack and Rsbuild builds, and Next.js's webpack build (cached by `vp run`)
build:
    vp run -r build:extract
    vp run -r build:extract:single
    vp run -r build:extract:compact
    vp run -r build
    vp run -r build:rollup
    vp run -r build:rollup:extract
    vp run -r build:rollup:extract:single
    vp run -r build:rolldown
    vp run -r build:rolldown:extract
    vp run -r build:rolldown:extract:single
    vp run -r build:webpack
    vp run -r build:webpack:extract
    vp run -r build:webpack:extract:single
    vp run -r build:rspack
    vp run -r build:rspack:extract
    vp run -r build:rspack:extract:single
    vp run -r build:rsbuild
    vp run -r build:rsbuild:extract
    vp run -r build:rsbuild:extract:single

# Compare the examples' JS, CSS and HTML with and without extract; `--time` also times uncached builds
bench *args:
    vp run bench {{args}}

# Compare nishiki with other styling libraries on the same app, reusing cached builds; `--browser` and `--stress` add Chromium measurements, and `--time` times uncached builds
bench-compare *args:
    vp run bench:compare {{args}}

# Run the unit and integration tests
test:
    vp run test

# Format, lint and type-check through Vite+
check:
    vp run check

# Format the whole tree: Vite+ for JS/TS/JSON/Markdown/YAML, treefmt for the rest
fmt:
    vp check --fix
    nix fmt
