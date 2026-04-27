import { Editor, MarkdownView, Notice, Plugin, TFile, normalizePath } from "obsidian";
import { DEFAULT_SETTINGS, FathomSyncSettings, FathomSyncSettingTab } from "./settings";
import {
	FathomApiError,
	FathomClient,
	FathomMeeting,
	FathomSummary,
	FathomTranscriptItem,
	formatMeetingDate,
	meetingToBulletPoints,
	meetingToFullNote,
} from "./fathom-api";
import {
	ActionPickerModal,
	LoadingModal,
	MeetingPickAction,
	MeetingPickerModal,
} from "./meeting-picker-modal";

export default class FathomSyncPlugin extends Plugin {
	settings: FathomSyncSettings;

	async onload() {
		await this.loadSettings();
		this.addSettingTab(new FathomSyncSettingTab(this.app, this));

		this.addRibbonIcon("mic", "Fathom Meeting Sync", () => {
			this.openMeetingPicker();
		});

		this.addCommand({
			id: "fathom-sync-all",
			name: "Sync all recordings to vault",
			callback: () => this.syncAllMeetings(),
		});

		this.addCommand({
			id: "fathom-pick-meeting",
			name: "Pull a specific meeting…",
			callback: () => this.openMeetingPicker(),
		});

		this.addCommand({
			id: "fathom-insert-bullets",
			name: "Insert meeting as bullet points",
			editorCallback: (editor: Editor) => this.openMeetingPicker("insert-bullets", editor),
		});
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<FathomSyncSettings>,
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	// --- Commands ---

	private async syncAllMeetings() {
		if (!this.settings.apiKey) {
			new Notice("Please configure your Fathom API key in settings.");
			return;
		}

		const loading = new LoadingModal("Fathom: Fetching meetings…");
		try {
			const client = new FathomClient(this.settings.apiKey);
			const meetings = await client.listAllMeetings({
				includeSummary: true,
				includeActionItems: this.settings.includeActionItems,
				onPage: (count) => loading.update(`Fathom: Fetched ${count} meetings…`),
			});

			loading.update(`Fathom: Syncing ${meetings.length} meetings…`);

			let synced = 0;
			let skipped = 0;

			for (const meeting of meetings) {
				const existed = await this.syncMeetingToNote(client, meeting);
				if (existed) skipped++;
				else synced++;
				loading.update(`Fathom: Synced ${synced}/${meetings.length}…`);
			}

			loading.close();
			new Notice(`Fathom: Synced ${synced} meetings (${skipped} already up to date).`);
		} catch (e) {
			loading.close();
			this.handleApiError(e);
		}
	}

	private openMeetingPicker(action?: MeetingPickAction, editor?: Editor) {
		if (!this.settings.apiKey) {
			new Notice("Please configure your Fathom API key in settings.");
			return;
		}

		const loading = new LoadingModal("Fathom: Loading meetings…");
		const client = new FathomClient(this.settings.apiKey);

		client
			.listAllMeetings({ includeSummary: false })
			.then((meetings) => {
				loading.close();

				if (meetings.length === 0) {
					new Notice("No Fathom meetings found.");
					return;
				}

				if (action) {
					// Action already known — go straight to meeting picker
					new MeetingPickerModal(this.app, meetings, action, (result) => {
						this.handleMeetingPick(result.meeting, result.action, editor);
					}).open();
				} else {
					// Ask what to do first, then pick a meeting
					new ActionPickerModal(this.app, (chosenAction) => {
						new MeetingPickerModal(this.app, meetings, chosenAction, (result) => {
							this.handleMeetingPick(result.meeting, result.action, editor);
						}).open();
					}).open();
				}
			})
			.catch((e) => {
				loading.close();
				this.handleApiError(e);
			});
	}

	private async handleMeetingPick(
		meeting: FathomMeeting,
		action: MeetingPickAction,
		editor?: Editor,
	) {
		const loading = new LoadingModal(`Fathom: Loading "${meeting.title}"…`);
		try {
			const client = new FathomClient(this.settings.apiKey);
			const [summary, transcript] = await Promise.all([
				client.getMeetingSummary(meeting.recording_id).catch(() => null),
				this.settings.includeTranscript
					? client.getMeetingTranscript(meeting.recording_id).catch(() => null)
					: Promise.resolve(null),
			]);

			loading.close();

			if (action === "create-note") {
				const file = await this.syncMeetingToNote(client, meeting, summary, transcript, true);
				if (file) {
					new Notice(`Created: ${file.name}`);
					if (this.settings.openNoteAfterSync) {
						this.app.workspace.getLeaf(false).openFile(file);
					}
				}
			} else if (action === "insert-bullets") {
				const bullets = meetingToBulletPoints(meeting, summary);
				this.insertIntoEditor(editor, bullets);
			} else if (action === "insert-bullets-and-link") {
				const file = await this.syncMeetingToNote(client, meeting, summary, transcript);
				const bullets = meetingToBulletPoints(meeting, summary);
				const link = file ? `\n\t- Note: [[${file.basename}]]` : "";
				this.insertIntoEditor(editor, bullets + link);
				if (file && this.settings.openNoteAfterSync) {
					this.app.workspace.getLeaf(false).openFile(file);
				}
			}
		} catch (e) {
			loading.close();
			this.handleApiError(e);
		}
	}

	// --- Core sync logic ---

	private async syncMeetingToNote(
		client: FathomClient,
		meeting: FathomMeeting,
		summaryData?: FathomSummary | null,
		transcriptData?: FathomTranscriptItem[] | null,
		force = false,
	): Promise<TFile | null> {
		const filename = this.buildFilename(meeting);
		const folderPath = normalizePath(this.settings.syncFolder);
		const filePath = normalizePath(`${folderPath}/${filename}.md`);

		// Ensure folder exists
		if (!this.app.vault.getAbstractFileByPath(folderPath)) {
			await this.app.vault.createFolder(folderPath);
		}

		const existing = this.app.vault.getAbstractFileByPath(filePath);
		if (existing instanceof TFile && !force) {
			return existing;
		}

		// Fetch summary/transcript if not already provided
		const summary =
			summaryData !== undefined
				? summaryData
				: await client.getMeetingSummary(meeting.recording_id).catch(() => null);

		const transcript =
			transcriptData !== undefined
				? transcriptData
				: this.settings.includeTranscript
				? await client.getMeetingTranscript(meeting.recording_id).catch(() => null)
				: null;

		const content = meetingToFullNote(meeting, summary, transcript);

		if (existing instanceof TFile) {
			await this.app.vault.modify(existing, content);
			return existing;
		} else {
			return this.app.vault.create(filePath, content);
		}
	}

	private buildFilename(meeting: FathomMeeting): string {
		const date = formatMeetingDate(meeting);
		const date_obj = new Date(meeting.started_at ?? meeting.created_at);
		const time = date_obj
			.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })
			.replace(":", "-");
		const title = (meeting.title ?? "Untitled Meeting")
			.replace(/[\\/:*?"<>|]/g, "-")
			.replace(/\s+/g, " ")
			.trim();

		return this.settings.filenameTemplate
			.replace("{{date}}", date)
			.replace("{{time}}", time)
			.replace("{{title}}", title)
			.trim();
	}

	// --- Helpers ---

	private insertIntoEditor(editor: Editor | undefined, text: string) {
		if (editor) {
			const cursor = editor.getCursor();
			editor.replaceRange(text + "\n", cursor);
		} else {
			const view = this.app.workspace.getActiveViewOfType(MarkdownView);
			if (view?.editor) {
				const cursor = view.editor.getCursor();
				view.editor.replaceRange(text + "\n", cursor);
			} else {
				// Fallback: copy to clipboard
				navigator.clipboard.writeText(text).then(() => {
					new Notice("No active note — meeting copied to clipboard.");
				});
			}
		}
	}

	private handleApiError(e: unknown) {
		if (e instanceof FathomApiError) {
			if (e.status === 401) {
				new Notice("Fathom: Invalid API key. Please check your settings.");
			} else {
				new Notice(`Fathom API error: ${e.message}`);
			}
		} else {
			new Notice(`Fathom: Unexpected error — ${e instanceof Error ? e.message : String(e)}`);
			console.error("[Fathom Sync]", e);
		}
	}
}
