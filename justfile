# Task runner. Run `just --list` to see everything.

[private]
default:
    @just --list

# Install the JS dependencies needed to work in this repository
install:
    vp install --frozen-lockfile
    # The dev shell re-installs when the lockfile is newer than this stamp.
    touch node_modules/.install-stamp

# Build every package and every example, with and without extract (cached by `vp run`)
build:
    vp run -r build
    vp run -r build:extract

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
