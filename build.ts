
const OUTDIR = Bun.env.OUTDIR ?? "./dist";

Bun.build({
    entrypoints: ["./src/main.ts"],
    outdir: OUTDIR,
    format: "cjs",
    external: ["obsidian"],
    loader: {
        ".json": "file",
    },
    naming: {
        asset: "[name].[ext]",
    },
    // drop: ["console"],
    target: "node"
});
