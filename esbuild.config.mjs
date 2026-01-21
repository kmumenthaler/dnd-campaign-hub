import { build } from "esbuild";
import { copyFileSync, mkdirSync } from "node:fs";

const outdir = "dist";
const isWatch = process.argv.includes("--watch");

mkdirSync(outdir, { recursive: true });

const copyStatic = () => {
  copyFileSync("manifest.json", `${outdir}/manifest.json`);
  copyFileSync("src/styles.css", `${outdir}/styles.css`);
  copyFileSync("versions.json", `${outdir}/versions.json`);
};

const buildOnce = async () => {
  const buildOptions = {
    entryPoints: ["src/main.ts"],
    bundle: true,
    platform: "browser",
    format: "cjs",
    target: "es2018",
    outfile: `${outdir}/main.js`,
    sourcemap: true,
    external: ["obsidian"],
    logLevel: "info",
  };

  if (isWatch) {
    const ctx = await build({
      ...buildOptions,
      watch: {
        onRebuild(error) {
          if (error) {
            console.error("rebuild failed", error);
          } else {
            copyStatic();
            console.log("rebuild succeeded");
          }
        },
      },
    });
    copyStatic();
    console.log("watching for changes...");
  } else {
    await build(buildOptions);
    copyStatic();
  }
};

buildOnce().catch((err) => {
  console.error(err);
  process.exit(1);
});
