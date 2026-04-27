import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type FathomSyncPlugin from "./main";
import { FathomClient } from "./fathom-api";

export interface FathomSyncSettings {
	apiKey: string;
	syncFolder: string;
	includeTranscript: boolean;
	includeActionItems: boolean;
	filenameTemplate: string;
	openNoteAfterSync: boolean;
}

export const DEFAULT_SETTINGS: FathomSyncSettings = {
	apiKey: "",
	syncFolder: "Meetings/Fathom",
	includeTranscript: false,
	includeActionItems: true,
	filenameTemplate: "{{date}} {{title}}",
	openNoteAfterSync: false,
};

export class FathomSyncSettingTab extends PluginSettingTab {
	plugin: FathomSyncPlugin;

	constructor(app: App, plugin: FathomSyncPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h2", { text: "Fathom Meeting Sync" });

		// --- Authentication ---
		containerEl.createEl("h3", { text: "Authentication" });

		new Setting(containerEl)
			.setName("Fathom API key")
			.setDesc(
				createFragment((frag) => {
					frag.appendText("Your Fathom API key. Find it at ");
					frag.createEl("a", {
						text: "app.fathom.video → Settings → API",
						href: "https://app.fathom.video/settings/api",
					});
					frag.appendText(".");
				}),
			)
			.addText((text) =>
				text
					.setPlaceholder("fathom_...")
					.setValue(this.plugin.settings.apiKey)
					.then((t) => {
						t.inputEl.type = "password";
						t.inputEl.style.width = "100%";
					})
					.onChange(async (value) => {
						this.plugin.settings.apiKey = value.trim();
						await this.plugin.saveSettings();
					}),
			)
			.addButton((btn) =>
				btn
					.setButtonText("Test connection")
					.setCta()
					.onClick(async () => {
						btn.setButtonText("Testing…").setDisabled(true);
						try {
							const client = new FathomClient(this.plugin.settings.apiKey);
							const result = await client.listMeetings({ includeSummary: false });
							new Notice(
								`✓ Connected! Found ${result.meetings.length} recent meetings.`,
							);
						} catch (e) {
							new Notice(`✗ Connection failed: ${e instanceof Error ? e.message : String(e)}`);
						} finally {
							btn.setButtonText("Test connection").setDisabled(false);
						}
					}),
			);

		// --- Sync folder ---
		containerEl.createEl("h3", { text: "Sync settings" });

		new Setting(containerEl)
			.setName("Sync folder")
			.setDesc(
				"Vault folder where synced meeting notes will be saved. Will be created if it doesn't exist.",
			)
			.addText((text) =>
				text
					.setPlaceholder("Meetings/Fathom")
					.setValue(this.plugin.settings.syncFolder)
					.onChange(async (value) => {
						this.plugin.settings.syncFolder = value.trim();
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Note filename template")
			.setDesc(
				"Template for note filenames. Available variables: {{date}} (YYYY-MM-DD), {{time}} (HH-MM), {{title}}.",
			)
			.addText((text) =>
				text
					.setPlaceholder("{{date}} {{title}}")
					.setValue(this.plugin.settings.filenameTemplate)
					.onChange(async (value) => {
						this.plugin.settings.filenameTemplate = value.trim() || "{{date}} {{title}}";
						await this.plugin.saveSettings();
					}),
			);

		// --- Content options ---
		containerEl.createEl("h3", { text: "Note content" });

		new Setting(containerEl)
			.setName("Include transcript")
			.setDesc(
				"Include the full meeting transcript in synced notes. This makes notes significantly longer.",
			)
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.includeTranscript).onChange(async (value) => {
					this.plugin.settings.includeTranscript = value;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName("Include action items")
			.setDesc("Include action items extracted by Fathom in synced notes.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.includeActionItems)
					.onChange(async (value) => {
						this.plugin.settings.includeActionItems = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Open note after sync")
			.setDesc("Automatically open the note in Obsidian after syncing a meeting.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.openNoteAfterSync)
					.onChange(async (value) => {
						this.plugin.settings.openNoteAfterSync = value;
						await this.plugin.saveSettings();
					}),
			);
	}
}
