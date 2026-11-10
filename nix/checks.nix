_:
let
  root = ./..;
in
{
  perSystem =
    { pkgs, lib, ... }:
    let
      repoSrc = lib.cleanSourceWith {
        name = "source";
        src = root;
        filter =
          path: type:
          !(
            type == "directory"
            && builtins.elem (baseNameOf path) [
              "node_modules"
              "coverage"
            ]
          );
      };
      mkRepoCheck =
        name: nativeBuildInputs: command:
        pkgs.runCommand name
          {
            src = repoSrc;
            inherit nativeBuildInputs;
          }
          ''
            cp -R "$src" source
            chmod -R u+w source
            cd source
            ${command}
            touch "$out"
          '';
    in
    {
      checks = {
        gitleaks = mkRepoCheck "gitleaks-check" [ pkgs.gitleaks ] ''
          gitleaks detect --source . --config .gitleaks.toml --no-git
        '';
      };
    };
}
