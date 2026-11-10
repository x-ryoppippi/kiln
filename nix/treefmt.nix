{ lib, ... }:
let
  root = ./..;
in
{
  perSystem =
    { pkgs, ... }:
    {
      treefmt = {
        inherit pkgs;
        projectRoot = root;
        projectRootFile = "flake.nix";

        programs = {
          deadnix.enable = true;
          nixfmt.enable = true;
          statix.enable = true;
          # JavaScript, TypeScript, JSON, Markdown and YAML are formatted by
          # `vp check`, which reads its config from vite.config.ts.
          typos = {
            enable = true;
            configFile = "./typos.toml";
          };
        };

        settings.formatter = {
          deadnix.priority = 1;
          statix.priority = 2;
          nixfmt.priority = 3;
          actionlint = {
            command = lib.getExe pkgs.actionlint;
            includes = [
              ".github/workflows/*.yaml"
              ".github/workflows/*.yml"
            ];
            priority = 4;
          };
          zizmor = {
            command = lib.getExe pkgs.zizmor;
            options = [
              "--offline"
              "--min-severity"
              "high"
              "--min-confidence"
              "high"
            ];
            includes = [
              ".github/workflows/*.yaml"
              ".github/workflows/*.yml"
            ];
            priority = 5;
          };
        };
      };
    };
}
