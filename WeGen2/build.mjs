import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
// Keep critical presentation and interactions in the HTML response.
const root = dirname(fileURLToPath(import.meta.url));
const read = (name) => readFileSync(join(root, name), "utf8");
let html = read("index.html");
function replaceBlock(name, content) {
  const pattern = new RegExp(`<!-- INLINE_${name}_START -->[\\s\\S]*?<!-- INLINE_${name}_END -->`);
  if (!pattern.test(html)) throw new Error(`Missing inline ${name} markers`);
  html = html.replace(pattern, () => `<!-- INLINE_${name}_START -->\n${content}\n<!-- INLINE_${name}_END -->`);
}
replaceBlock("STYLE", `<style>\n${read("style.css")}\n</style>`);
replaceBlock(
  "DATA",
  [
    ["reference", "reference-map.json"],
    ["links", "links.json"],
    ["preview", "preview-map.json"],
  ]
    .map(
      ([id, file]) => `<script type="application/json" id="${id}-data">${JSON.stringify(JSON.parse(read(file))).replaceAll("<", "\\u003c")}</script>`
    )
    .join("\n")
);
replaceBlock("APP", `<script>\n${read("app.js")}\n</script>`);
writeFileSync(join(root, "index.html"), html);
console.log("Prepared standalone WeGen2 HTML");
