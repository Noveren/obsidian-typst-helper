import "../manifest.json";
import { App, FileSystemAdapter, Notice, Platform, Plugin, PluginSettingTab, Setting, TAbstractFile, TFile, normalizePath } from "obsidian";
import { exec as _exec, spawn } from "child_process";
import { promisify } from "util";
const exec = promisify(_exec);

interface TypstHelperSettings {
    value: string;

}

const DEFAULT_SETTINGS: TypstHelperSettings = {
    value: "",
};

export class TypstHelperSettingTab extends PluginSettingTab {
    plugin: TypstHelper;

    constructor(app: App, plugin: TypstHelper) {
        super(app, plugin);
        this.plugin = plugin;
    }

    override display(): void {
        const { containerEl } = this;
        containerEl.empty();
        new Setting(containerEl)
            .setName("Typt Helper Settings")
            .setDesc("TODO")
            .addText(text => text
                .setPlaceholder("Enter your secret")
                .setValue(this.plugin.settings?.value ?? "")
                .onChange(async (value) => {
                    if (this.plugin.settings) {
                        this.plugin.settings.value = value;
                        await this.plugin.saveSettings();
                    }
                })
            );
    }
}

export default class TypstHelper extends Plugin {
    settings: TypstHelperSettings | undefined;

    async saveSettings() {
        await this.saveData(this.settings);
    }

    override async onload(): Promise<void> {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData() as Partial<TypstHelperSettings>);

        this.registerEvent(this.app.workspace.on("file-menu", (menu, file) => {
            if (file.name.endsWith(".typ")) {
                menu.addItem(item => {
                    item.setTitle("typst: open with editor")
                        .setIcon("popup-open")
                        .onClick(async () => await this.openWithEditor(file));
                });
            }
        })
        );

        this.registerEvent(this.app.workspace.on("file-menu", (menu, file) => {
            if (file.name.endsWith(".typ")) {
                menu.addItem(item => {
                    item.setTitle("typst: compile")
                        .setIcon("popup-open")
                        .onClick(async () => await this.compileWithTypst(file));

                });
            }
        })
        );

        this.registerDomEvent(document, "click", async (event) => {
            const path = getObsidianVaultFilePathWhenClick(event);
            if (path && path.endsWith(".typ")) {
                event.preventDefault();
                event.stopImmediatePropagation();
                const file_typ = this.app.vault.getFileByPath(path)!;
                const file_pdf = this.app.vault.getFileByPath(path.replace(".typ", ".pdf"));
                if (file_pdf) {
                    await this.app.workspace.getLeaf().openFile(file_pdf);
                } else {
                    new Notice(`'${file_typ.basename}.pdf' does not exist.`);
                    // this.compileWithTypst(file_typ);
                }
            }
        }, true);

        this.addSettingTab(new TypstHelperSettingTab(this.app, this));
    }

    override onunload(): void {
    }

    private getAbsolutePath(file: TAbstractFile): string {
        const adpater = this.app.vault.adapter as FileSystemAdapter;
        const path = normalizePath(`${adpater.getBasePath()}/${file.path}`);
        return path;
    }

    private async openWithEditor(file: TAbstractFile) {
        const command = "code";
        if (await checkCommandExists(command)) {
            const path = this.getAbsolutePath((file.parent as TAbstractFile));
            const child_process = spawn(command, [path], {
                stdio: "ignore",
                detached: true,
                shell: Platform.isWin,
            });
        } else {
            new Notice(`${command}: command not found.`);
        }
    }

    private async compileWithTypst(file: TAbstractFile) {
        const typst = "typst";
        if (!await checkCommandExists(typst)) {
            new Notice(`${typst}: typst not found.`);
            return;
        }
        if (!(file instanceof TFile)) {
            new Notice(``);
            return;
        }
        const path = this.getAbsolutePath((file));
        console.log(`${typst} ${path}`);
        try {
            await exec(`${typst} c ${path}`);
        } catch (err) {
            new Notice(`${err} ${path}`);
        }
    }
};

function getObsidianVaultFilePathWhenClick(event: Event): string | null {
    const target = event.target as HTMLElement;
    const item = target.closest('.nav-file');
    const path = item?.querySelector('.nav-file-title')?.getAttr("data-path");
    return path ?? null;
}

async function checkCommandExists(command: string): Promise<boolean> {
    try {
        if (Platform.isWin) {
            await exec(`where ${command}`);
            return true;
        }
        if (Platform.isLinux || Platform.isMacOS) {
            await exec(`which ${command}`);
            return true;
        }
    } catch (err) {
        console.error(err);
    }
    return false;
}