{ inputs, ... }:
{
  perSystem =
    { pkgs, system, ... }:
    {
      # vp runs in system-first mode and picks the first Node on PATH, so the
      # wrapper's Node is the one the project builds and tests with.
      packages.vp = inputs.nix-vite-plus.packages.${system}.vp.override { nodejs = pkgs.nodejs_24; };
    };
}
