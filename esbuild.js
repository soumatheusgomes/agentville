const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);
const isWatch = args.includes("--watch");
const isMinify = args.includes("--minify");

const extensionOptions = {
  entryPoints: ["src/extension.ts"],
  bundle: true,
  outfile: "dist/extension.js",
  external: ["vscode"],
  format: "cjs",
  platform: "node",
  target: "node18",
  minify: isMinify,
  sourcemap: !isMinify,
  logLevel: "info",
};

// The office webview runs in a browser context inside VS Code, not in Node. Phaser is
// bundled in here — it must never reach the extension bundle.
const webviewOptions = {
  entryPoints: ["src/webview/main.ts"],
  bundle: true,
  outfile: "dist/webview.js",
  format: "iife",
  platform: "browser",
  target: "es2020",
  minify: isMinify,
  sourcemap: !isMinify,
  logLevel: "info",
};

// The office art ships from dist/office/: the committed CC0 baseline first, then — when a
// developer has a licensed premium tileset locally — its files on top. Filenames are
// identical, so nothing downstream branches on which tier is active, and the committed
// baseline is never overwritten (which would risk committing the commercial pack).
function assembleOfficeAssets() {
  const out = path.join(__dirname, "dist", "office");
  fs.mkdirSync(out, { recursive: true });
  for (const tier of ["office", "office-premium"]) {
    const dir = path.join(__dirname, "resources", tier);
    if (!fs.existsSync(dir)) {
      continue;
    }
    for (const file of fs.readdirSync(dir)) {
      fs.copyFileSync(path.join(dir, file), path.join(out, file));
    }
    if (tier === "office-premium") {
      console.log("Applied premium office assets over the baseline.");
    }
  }
}

async function run() {
  assembleOfficeAssets();
  if (isWatch) {
    for (const options of [extensionOptions, webviewOptions]) {
      const ctx = await esbuild.context(options);
      await ctx.watch();
    }
    console.log("Watching for changes...");
  } else {
    await Promise.all([esbuild.build(extensionOptions), esbuild.build(webviewOptions)]);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
