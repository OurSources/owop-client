{ nixpkgs ? import <nixpkgs> {  } }:
with nixpkgs; buildNpmPackage {
	name = "owop-old-client";
	npmDepsHash = "sha256-h63JqnJuEqQvN9tV1jMWMsb5wEHvh/gjdSKXzY6qDaw=";

	npmBuildScript = "release";
	NODE_OPTIONS = "--openssl-legacy-provider";

	src = fetchGit {
		url = ./.;
	};

	postInstall = ''
		mkdir -p $out/share/www/
		cp -r dist $out/share/www/owop
	'';

	meta = {
		description = "The Our World of Pixels legacy client.";
		homepage = "https://ourworldofpixels.com";
		platforms = lib.platforms.linux;
	};
}
