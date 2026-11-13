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

// The premium tileset is licensed per developer and never committed. When the directory
// exists locally its files win over the CC0 baseline; filenames are identical, so nothing
// downstream branches on which tier is active.
function applyPremiumAssets() {
  const premium = path.join(__dirname, "resources", "office-premium");
  const baseline = path.join(__dirname, "resources", "office");
  if (!fs.existsSync(premium)) {
    return;
  }
  for (const file of fs.readdirSync(premium)) {
    fs.copyFileSync(path.join(premium, file), path.join(baseline, file));
  }
  console.log("Applied premium office assets over the baseline.");
}

async function run() {
  applyPremiumAssets();
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
