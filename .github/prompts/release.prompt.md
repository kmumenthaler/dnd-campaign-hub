---
description: "Create a new tagged release of the dnd-campaign-hub plugin with proper versioning and assets."
---

# Release dnd-campaign-hub

Create a new release for the dnd-campaign-hub plugin.

## Steps

1. **Determine version** — Read the current version from `manifest.json`. Decide the next version using semver (patch for fixes, minor for features, major for breaking changes). If the user specified a version, use that.
2. **Update version files** — Update `version` in `manifest.json`, `package.json`, and add the new version entry to `versions.json` mapping the version to the minimum Obsidian version from `manifest.json`.
3. **Update CHANGELOG.md** — Add a section for the new version with today's date and a summary of changes since the last release (use `git log`).
4. **Build** — Run `npm run build` and confirm it succeeds.
5. **Deploy** — Copy `dist/main.js`, `manifest.json`, and `src/styles.css` to the test vault at `C:\Users\kevin\SynologyDrive\Obsidian Vault\TTRPG Vault\.obsidian\plugins\dnd-campaign-hub\`.
6. **Commit** — `git add -A && git commit -m "chore: release vX.Y.Z"`.
7. **Tag** — `git tag -a vX.Y.Z -m "Release vX.Y.Z"`.
8. **Copy release assets** — Copy `dist/main.js`, `manifest.json`, and `src/styles.css` into the `release/` folder.
9. **Push** — `git push origin main --tags`.
10. **Create GitHub release** — Run `gh release create vX.Y.Z --title "vX.Y.Z" --notes-file CHANGELOG.md release/main.js release/manifest.json release/styles.css`. If `gh` is not on PATH, use the full path `"C:\Program Files\GitHub CLI\gh.exe"`.
11. **Report** — Tell the user the release is published and link to the GitHub release page.
