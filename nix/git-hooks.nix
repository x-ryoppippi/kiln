{ lib, ... }:
let
  root = ./..;
in
{
  perSystem =
    { config, pkgs, ... }:
    {
      pre-commit = {
        check.enable = false;
        inherit pkgs;
        settings = {
          src = root;
          package = pkgs.prek;
          hooks = {
            treefmt = {
              enable = true;
              name = "treefmt";
              # prek runs file batches in parallel; treefmt's shared cache db would race between them.
              entry = "${lib.getExe config.treefmt.build.wrapper} --no-cache";
              files = ".*";
              pass_filenames = true;
              stages = [ "pre-commit" ];
              priority = 10;
            };
            vp-check-fix = {
              enable = true;
              name = "vp check";
              entry = "${lib.getExe config.packages.vp} check --fix --no-error-on-unmatched-pattern";
              files = "\\.(ts|tsx|js|mjs|json|jsonc|md|ya?ml)$";
              pass_filenames = true;
              stages = [ "pre-commit" ];
              priority = 5;
            };
            gitleaks-protect = {
              enable = true;
              name = "gitleaks";
              entry = "${lib.getExe pkgs.gitleaks} protect --staged --config .gitleaks.toml";
              pass_filenames = false;
              always_run = true;
              stages = [ "pre-commit" ];
              priority = 20;
            };
            treefmt-check = {
              enable = true;
              name = "treefmt";
              entry = "${lib.getExe config.treefmt.build.wrapper} --fail-on-change";
              files = ".*";
              pass_filenames = false;
              stages = [ "pre-push" ];
              priority = 0;
            };
            gitleaks-detect = {
              enable = true;
              name = "gitleaks";
              entry = "${lib.getExe pkgs.gitleaks} detect --config .gitleaks.toml";
              files = ".*";
              pass_filenames = false;
              always_run = true;
              stages = [ "pre-push" ];
              priority = 0;
            };
            vp-check = {
              enable = true;
              name = "vp check";
              entry = "${lib.getExe config.packages.vp} run check";
              files = "\\.(ts|tsx|js|mjs|json|jsonc|md|ya?ml)$";
              pass_filenames = false;
              stages = [ "pre-push" ];
              priority = 0;
            };
            vp-test = {
              enable = true;
              name = "vp test";
              entry = "${lib.getExe config.packages.vp} run test";
              files = "\\.(ts|tsx|js|json)$";
              pass_filenames = false;
              stages = [ "pre-push" ];
              priority = 10;
            };
          };
        };
      };
    };
}
