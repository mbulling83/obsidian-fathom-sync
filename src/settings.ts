import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type FathomSyncPlugin from "./main";
import { FathomClient } from "./fathom-api";

export type AutoSyncInterval = 0 | 15 | 30 | 60 | 120 | 240;

export interface FathomSyncSettings {
	apiKey: string;
	syncFolder: string;
	includeTranscript: boolean;
	includeActionItems: boolean;
	filenameTemplate: string;
	openNoteAfterSync: boolean;
	syncOnStartup: boolean;
	autoSyncIntervalMinutes: AutoSyncInterval;
}

export const DEFAULT_SETTINGS: FathomSyncSettings = {
	apiKey: "",
	syncFolder: "Meetings/Fathom",
	includeTranscript: false,
	includeActionItems: true,
	filenameTemplate: "{{date}} {{title}}",
	openNoteAfterSync: false,
	syncOnStartup: false,
	autoSyncIntervalMinutes: 0,
};

const INTERVAL_OPTIONS: Record<AutoSyncInterval, string> = {
	0: "Off",
	15: "Every 15 minutes",
	30: "Every 30 minutes",
	60: "Every hour",
	120: "Every 2 hours",
	240: "Every 4 hours",
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
							new Notice(`✓ Connected! Found ${result.items.length} recent meetings.`);
						} catch (e) {
							new Notice(`✗ Connection failed: ${e instanceof Error ? e.message : String(e)}`);
						} finally {
							btn.setButtonText("Test connection").setDisabled(false);
						}
					}),
			);

		new Setting(containerEl)
			.setName("Sync folder")
			.setDesc("Vault folder where synced meeting notes will be saved. Will be created if it doesn't exist.")
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
			.setDesc("Template for note filenames. Variables: {{date}} (YYYY-MM-DD), {{time}} (HH-MM), {{title}}.")
			.addText((text) =>
				text
					.setPlaceholder("{{date}} {{title}}")
					.setValue(this.plugin.settings.filenameTemplate)
					.onChange(async (value) => {
						this.plugin.settings.filenameTemplate = value.trim() || "{{date}} {{title}}";
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Sync on startup")
			.setDesc("Automatically sync all meetings when Obsidian starts.")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.syncOnStartup).onChange(async (value) => {
					this.plugin.settings.syncOnStartup = value;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName("Auto-sync interval")
			.setDesc("Automatically sync meetings in the background on a schedule.")
			.addDropdown((drop) => {
				for (const [val, label] of Object.entries(INTERVAL_OPTIONS)) {
					drop.addOption(val, label);
				}
				drop.setValue(String(this.plugin.settings.autoSyncIntervalMinutes));
				drop.onChange(async (value) => {
					this.plugin.settings.autoSyncIntervalMinutes = Number(value) as AutoSyncInterval;
					await this.plugin.saveSettings();
					this.plugin.rescheduleAutoSync();
				});
			});

		new Setting(containerEl)
			.setName("Include transcript")
			.setDesc("Include the full meeting transcript in synced notes. Makes notes significantly longer.")
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
				toggle.setValue(this.plugin.settings.includeActionItems).onChange(async (value) => {
					this.plugin.settings.includeActionItems = value;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName("Open note after sync")
			.setDesc("Automatically open the note in Obsidian after syncing a specific meeting.")
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.openNoteAfterSync).onChange(async (value) => {
					this.plugin.settings.openNoteAfterSync = value;
					await this.plugin.saveSettings();
				}),
			);
	}
}
