# Release dnd-campaign-hub

Create a new release for the dnd-campaign-hub plugin. If a version is specified use that, otherwise determine the next version using semver based on the changes since the last release.

## Steps

1. **Determine version** — Read the current version from `manifest.json`. Decide the next version using semver (patch for fixes, minor for features, major for breaking changes). If the user specified a version in $ARGUMENTS, use that.

2. **Update version files** — Update `version` in `manifest.json`, `package.json`, and add a new entry to `versions.json` mapping the new version to the minimum Obsidian version from `manifest.json`.

3. **Update CHANGELOG.md** — Add a section for the new version with today's date and a summary of changes since the last release (use `git log` to gather them).

4. **Validate** — Run `npm run check` and confirm it succeeds.

5. **Test** — Run `npm run test` and confirm all tests pass.

6. **Build** — Run `npm run build` and confirm it succeeds.

7. **Deploy** — Copy `dist/main.js`, `manifest.json`, and `src/styles.css` to:
   `C:\Users\kevin\SynologyDrive\Obsidian Vault\TTRPG Vault\.obsidian\plugins\dnd-campaign-hub\`

8. **Commit** — `git add -A && git commit -m "chore: release vX.Y.Z"`.

9. **Tag** — `git tag -a vX.Y.Z -m "Release vX.Y.Z"`.

10. **Copy release assets** — Copy `dist/main.js`, `manifest.json`, and `src/styles.css` into the `release/` folder.

11. **Push** — `git push origin main --tags`.

12. **Create GitHub release** — Run:
    ```
    gh release create vX.Y.Z --title "vX.Y.Z" --notes-file CHANGELOG.md release/main.js release/manifest.json release/styles.css
    ```
    If `gh` is not on PATH, use the full path `"C:\Program Files\GitHub CLI\gh.exe"`.

13. **Report** — Tell the user the release is published and provide the link to the GitHub release page.
