import "../manifest.json";
import { App, FileSystemAdapter, Notice, Platform, Plugin, PluginSettingTab, Setting, TAbstractFile, TFile, TFolder, normalizePath } from "obsidian";
import { exec as _exec, spawn } from "child_process";
import { promisify } from "util";
const exec = promisify(_exec);

const WhenClickedMap = {
    None: "None",
    PDF: "Open the associated pdf",
    Compile: "Compile the file into pdf and open",
} as const;

type WhenClickedValue = keyof typeof WhenClickedMap;

interface TypstHelperSettings {
    typst_cli: string,
    when_clicked: WhenClickedValue;
    support_typ_md: boolean;
}

const DEFAULT_SETTINGS: TypstHelperSettings = {
    typst_cli: "typst",
    when_clicked: "PDF",
    support_typ_md: true,
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
            .setName("Typst CLI")
            .setDesc("The path to typst CLI.")
            .addText(text => text
                .setValue(this.plugin.settings?.typst_cli!)
                .onChange(async (value) => {
                    // TODO 检查用户提供的 value 是否可以正常调用到 Typst
                    console.log(value);
                })
            );

        new Setting(containerEl)
            .setName("Support '.typ.md'")
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings?.support_typ_md ?? true)
                .onChange(async (value) => {
                    console.log(value);
                    if (this.plugin.settings) {
                        this.plugin.settings.support_typ_md = value;
                        await this.plugin.saveSettings();
                    }
                })
            );

        new Setting(containerEl)
            .setName("When clicked")
            .setDesc("When you click typst file.")
            .addDropdown(dropdown => dropdown
                .addOptions(WhenClickedMap)
                .setValue(this.plugin.settings?.when_clicked ?? "PDF")
                .onChange(async (value) => {
                    console.log(value);
                    if (this.plugin.settings) {
                        this.plugin.settings.when_clicked = (value as WhenClickedValue);
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

        this.registerEvent(this.app.workspace.on("file-menu", (menu, folder) => {
            if (folder instanceof TFolder) {
                menu.addItem(item => {
                    item.setTitle("typst: new note")
                        .setIcon("square-pen")
                        .onClick(async () => await this.createNewNote(folder));
                });

            }
        }));

        this.registerEvent(this.app.workspace.on("file-menu", (menu, file) => {
            if (isTypstFile(file, this.settings!.support_typ_md)) {
                menu.addItem(item => {
                    item.setTitle("typst: open with editor")
                        .setIcon("popup-open")
                        .onClick(async () => await this.openWithEditor(file));
                });
            }
        }));


        this.registerEvent(this.app.workspace.on("file-menu", (menu, file) => {
            if (isTypstFile(file, this.settings!.support_typ_md)) {
                menu.addItem(item => {
                    item.setTitle("typst: compile")
                        .setIcon("popup-open")
                        .onClick(async () => await this.compileWithTypst(file));

                });
            }
        }));

        this.registerDomEvent(document, "click", async (event) => {
            const path = getObsidianVaultFilePathWhenClick(event);
            if (path === null) {
                return;
            }
            const file_typ = this.app.vault.getFileByPath(path);
            if (file_typ === null || !isTypstFile(file_typ, this.settings!.support_typ_md)) {
                return;
            }

            event.preventDefault();
            event.stopImmediatePropagation();
            const path_pdf = path.replace(".typ", ".pdf");
            switch (this.settings?.when_clicked) {
            case "None": {
                break;
            }
            case "PDF": {
                const file_pdf = this.app.vault.getFileByPath(path_pdf);
                if (file_pdf) {
                    await this.app.workspace.getLeaf().openFile(file_pdf);
                } else {
                    new Notice(`'${file_typ.basename}.pdf' does not exist.`);
                }
                break;
            }
            case "Compile": {
                try {
                    let file_pdf = this.app.vault.getFileByPath(path_pdf);
                    let need_to_compile = !file_pdf;
                    if (!need_to_compile) {
                        const ctime = file_pdf!.stat.ctime;
                        const mtime = file_typ!.stat.mtime;
                        console.log(`pdf c: ${ctime}; type m: ${mtime}`);
                        need_to_compile = ctime < mtime;
                    }
                    if (need_to_compile) {
                        await this.compileWithTypst(file_typ);
                        file_pdf = this.app.vault.getFileByPath(path_pdf);
                    }
                    await this.app.workspace.getLeaf().openFile(file_pdf!);
                } catch (err) {
                    console.error(err);
                    new Notice(`Failed to compile '${file_typ}'.`);
                }
                break;
            }
            default: {
                console.error("this.settings.when_clicked is undefined");
                break;
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

    private async createNewNote(folder: TFolder) {
        let path = normalizePath(`${folder.path}/Untitled.typ`);
        if (await this.app.vault.adapter.exists(path)) {
            let i = 0;
            do {
                i += 1;
                path = normalizePath(`${folder.path}/Untitled_${i}.typ`);
            } while (await this.app.vault.adapter.exists(path));
        }
        await this.app.vault.adapter.write(path, "");
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
        // TODO 支持多文件编译：自动搜索 main.typ 或 index.typ
        const typst = "typst";
        if (!await checkCommandExists(typst)) {
            new Notice(`${typst}: typst not found.`);
            return;
        }
        if (!isTypstFile(file, this.settings!.support_typ_md)) {
            new Notice(`'${file.name}' isn't typst file.`);
            return;
        }
        const parent_folder = file.parent;
        if (file.parent === null) {
            new Notice(`The parent of '${file.name}' is null.`);
            return;
        }
        const root = this.getAbsolutePath(parent_folder!);
        const typ = normalizePath(root + "/" + file.name);
        const pdf = normalizePath(root + "/" + getTypstFileBasename(file, this.settings!.support_typ_md)! + ".pdf");
        const command = `${typst} c ${typ} ${pdf}`;
        console.log(command);
        try {
            await exec(command);
        } catch (err) {
            console.error(err);
            new Notice(`${err}`);
        }
    }
};

function isTypstFile(file: TAbstractFile, typ_md: boolean): boolean {
    if (file instanceof TFile) {
        if (file.extension == "typ") {
            return true;
        }
        if (typ_md && (file.extension == "md" && file.basename.endsWith(".typ"))) {
            return true;
        }
    }
    return false;
}

function getTypstFileBasename(file: TAbstractFile, typ_md: boolean): string | null {
    if (file instanceof TFile) {
        if (file.extension == "typ") {
            return file.basename;
        }
        if (typ_md && (file.extension == "md" && file.basename.endsWith(".typ"))) {
            return file.basename.substring(0, file.basename.length - ".typ".length);
        }
    }
    return null;
}

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