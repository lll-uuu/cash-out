// Build the pages from page.html.
//   node scripts/build.js                       -> index.html (the live page for GitHub Pages)
//   node scripts/build.js --embed snapshot.json --frame frame.jpg -> preview.html (self-contained, one frozen hour)
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const page = fs.readFileSync(path.join(root, "page.html"), "utf8");
const args = process.argv.slice(2);
const i = args.indexOf("--embed");

if (i < 0) {
  const html = `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n<style>html,body{margin:0}</style>\n</head>\n<body>\n${page}\n</body>\n</html>\n`;
  fs.writeFileSync(path.join(root, "index.html"), html);
  console.log("wrote index.html");
} else {
  const snap = fs.readFileSync(args[i + 1], "utf8");
  const engine = fs.readFileSync(path.join(root, "engine.js"), "utf8");
  const frame = fs.readFileSync(args[args.indexOf("--frame") + 1]).toString("base64");
  const html = page.replace('<script src="engine.js"></script>',
    `<script>window.CASHOUT_SNAPSHOT = ${snap.trim()};\nwindow.CASHOUT_FRAME = "data:image/jpeg;base64,${frame}";</script>\n<script>\n${engine}\n</script>`);
  const o = args.indexOf("--out");
  const out = o >= 0 ? args[o + 1] : path.join(root, "preview.html");
  fs.writeFileSync(out, html);
  console.log("wrote", out);
}
