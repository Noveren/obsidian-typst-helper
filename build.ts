
const OUTPUT: string = Bun.env.OUTPUT ?? "dist";
console.log(OUTPUT);

Bun.build({
    entrypoints: ["./src/main.ts"],
    outdir: `${OUTPUT}`,
    format: "cjs",
    external: ["obsidian"],
    target: "node"
});
