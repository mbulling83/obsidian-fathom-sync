import { App, FuzzyMatch, FuzzySuggestModal, Notice } from "obsidian";
import type { FathomMeeting } from "./fathom-api";
import { formatMeetingDate, formatMeetingTime, formatDuration, meetingDisplayTitle } from "./fathom-api";

export type MeetingPickAction = "insert-bullets" | "create-note" | "insert-bullets-and-link";

export interface MeetingPickResult {
	meeting: FathomMeeting;
	action: MeetingPickAction;
}

export class MeetingPickerModal extends FuzzySuggestModal<FathomMeeting> {
	private meetings: FathomMeeting[];
	private onChoose: (result: MeetingPickResult) => void;
	private action: MeetingPickAction;

	constructor(
		app: App,
		meetings: FathomMeeting[],
		action: MeetingPickAction,
		onChoose: (result: MeetingPickResult) => void,
	) {
		super(app);
		this.meetings = meetings;
		this.action = action;
		this.onChoose = onChoose;
		this.setPlaceholder("Search meetings by title, date, or attendee…");
		this.setInstructions([
			{ command: "↑↓", purpose: "navigate" },
			{ command: "↵", purpose: "select meeting" },
			{ command: "esc", purpose: "cancel" },
		]);
	}

	getItems(): FathomMeeting[] {
		return this.meetings;
	}

	getItemText(meeting: FathomMeeting): string {
		const date = formatMeetingDate(meeting);
		const attendees = meeting.calendar_invitees.map((i) => i.name ?? i.email ?? "").join(" ");
		return `${meetingDisplayTitle(meeting)} ${date} ${attendees}`;
	}

	renderSuggestion(item: FuzzyMatch<FathomMeeting>, el: HTMLElement): void {
		const meeting = item.item;
		const date = formatMeetingDate(meeting);
		const time = formatMeetingTime(meeting);
		const duration = ` · ${formatDuration(meeting)}`;

		el.addClass("fathom-meeting-suggestion");

		const titleEl = el.createDiv({ cls: "fathom-suggestion-title" });
		titleEl.setText(meetingDisplayTitle(meeting));

		const metaEl = el.createDiv({ cls: "fathom-suggestion-meta" });
		metaEl.setText(`${date} at ${time}${duration}`);

		if (meeting.calendar_invitees.length > 0) {
			const attendeeEl = el.createDiv({ cls: "fathom-suggestion-attendees" });
			attendeeEl.setText(
				meeting.calendar_invitees.map((i) => i.name ?? i.email ?? "Unknown").join(", "),
			);
		}
	}

	onChooseItem(item: FathomMeeting): void {
		this.onChoose({ meeting: item, action: this.action });
	}
}

export class ActionPickerModal extends FuzzySuggestModal<{ label: string; action: MeetingPickAction }> {
	private onChoose: (action: MeetingPickAction) => void;

	private static readonly ACTIONS: { label: string; action: MeetingPickAction }[] = [
		{
			label: "Insert as bullet points (into current note)",
			action: "insert-bullets",
		},
		{
			label: "Create full meeting note",
			action: "create-note",
		},
		{
			label: "Insert bullet points + link to full note",
			action: "insert-bullets-and-link",
		},
	];

	constructor(app: App, onChoose: (action: MeetingPickAction) => void) {
		super(app);
		this.onChoose = onChoose;
		this.setPlaceholder("How would you like to add this meeting?");
	}

	getItems(): { label: string; action: MeetingPickAction }[] {
		return ActionPickerModal.ACTIONS;
	}

	getItemText(item: { label: string; action: MeetingPickAction }): string {
		return item.label;
	}

	onChooseItem(item: { label: string; action: MeetingPickAction }): void {
		this.onChoose(item.action);
	}
}

export class LoadingModal {
	private notice: Notice;

	constructor(message: string) {
		this.notice = new Notice(message, 0);
	}

	update(message: string): void {
		this.notice.setMessage(message);
	}

	close(): void {
		this.notice.hide();
	}
}
