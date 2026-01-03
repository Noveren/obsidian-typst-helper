import { FileSystemAdapter, Platform, Plugin, TAbstractFile } from "obsidian";
import { normalize } from "path";
import { spawn } from "child_process";

export default class TypstHelper extends Plugin {
    override async onload(): Promise<void> {
        console.log("onload typst");

        this.registerEvent(
            this.app.workspace.on("file-menu", (menu, file) => {
                if (file.name.endsWith(".typ")) {
                    menu.addItem(item => {
                        item.setTitle("Open with typst-helper")
                            .setIcon("popup-open")
                            .onClick(async () => {
                                const path = this.getAbsolutePathOfFile(file);
                                console.log(`try to open ${path} with VS Code`);
                                const child_process = await spawn("code", [path], {
                                    stdio: "ignore",
                                    detached: true,
                                    shell: Platform.isWin,
                                });
                                child_process.unref();
                            });

                    });
                }
            })
        );
    }

    override onunload(): void {
        console.log("onunload typst");
    }

    private getAbsolutePathOfFile(file: TAbstractFile): string {
        const adpater = this.app.vault.adapter as FileSystemAdapter;
        const path = normalize(`${adpater.getBasePath()}/${file.path}`);
        // TODO
        if (Platform.isDesktop && navigator.platform == "Win32") {
            return path.replace(/\//g, "\\");
        }
        return path;
    }
}