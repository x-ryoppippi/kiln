_: {
  perSystem =
    { pkgs, ... }:
    {
      # Unmodified so it substitutes from cache.nixos.org; autoDedupe needs >= 12.8.1.
      packages.pnpm = pkgs.pnpm_12;
    };
}
