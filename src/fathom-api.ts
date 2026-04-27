import { requestUrl } from "obsidian";

const FATHOM_API_BASE = "https://api.fathom.ai/external/v1";

export interface FathomMeeting {
	id: string;
	recording_id: string;
	title: string;
	created_at: string;
	started_at?: string;
	ended_at?: string;
	duration_seconds?: number;
	attendees?: FathomAttendee[];
	summary?: FathomSummary;
	transcript?: FathomTranscriptItem[];
	action_items?: FathomActionItem[];
}

export interface FathomAttendee {
	name: string;
	email?: string;
}

export interface FathomSummary {
	short_summary?: string;
	long_summary?: string;
	keywords?: string[];
	topics?: string[];
	action_items?: FathomActionItem[];
}

export interface FathomTranscriptItem {
	speaker: string;
	start_time: number;
	end_time: number;
	text: string;
}

export interface FathomActionItem {
	text: string;
	assignee?: string;
	due_date?: string;
}

export interface FathomMeetingListResponse {
	meetings: FathomMeeting[];
	next_cursor?: string;
}

export class FathomApiError extends Error {
	constructor(
		message: string,
		public readonly status: number,
	) {
		super(message);
		this.name = "FathomApiError";
	}
}

export class FathomClient {
	constructor(private readonly apiKey: string) {}

	private async request<T>(path: string, params?: Record<string, string>): Promise<T> {
		if (!this.apiKey) {
			throw new FathomApiError("No API key configured. Please add your Fathom API key in settings.", 401);
		}

		const url = new URL(`${FATHOM_API_BASE}${path}`);
		if (params) {
			for (const [key, value] of Object.entries(params)) {
				url.searchParams.set(key, value);
			}
		}

		const response = await requestUrl({
			url: url.toString(),
			method: "GET",
			headers: {
				"X-Api-Key": this.apiKey,
				"Content-Type": "application/json",
			},
		});

		if (response.status < 200 || response.status >= 300) {
			throw new FathomApiError(
				`Fathom API error ${response.status}: ${response.text || "Unknown error"}`,
				response.status,
			);
		}

		return response.json as T;
	}

	async listMeetings(options: {
		cursor?: string;
		createdAfter?: string;
		createdBefore?: string;
		includeSummary?: boolean;
		includeActionItems?: boolean;
	} = {}): Promise<FathomMeetingListResponse> {
		const params: Record<string, string> = {};
		if (options.cursor) params["cursor"] = options.cursor;
		if (options.createdAfter) params["created_after"] = options.createdAfter;
		if (options.createdBefore) params["created_before"] = options.createdBefore;
		if (options.includeSummary) params["include_summary"] = "true";
		if (options.includeActionItems) params["include_action_items"] = "true";

		return this.request<FathomMeetingListResponse>("/meetings", params);
	}

	async listAllMeetings(options: {
		createdAfter?: string;
		includeSummary?: boolean;
		includeActionItems?: boolean;
		onPage?: (count: number) => void;
	} = {}): Promise<FathomMeeting[]> {
		const allMeetings: FathomMeeting[] = [];
		let cursor: string | undefined;

		do {
			const response = await this.listMeetings({
				cursor,
				createdAfter: options.createdAfter,
				includeSummary: options.includeSummary,
				includeActionItems: options.includeActionItems,
			});

			allMeetings.push(...response.meetings);
			cursor = response.next_cursor;

			if (options.onPage) {
				options.onPage(allMeetings.length);
			}
		} while (cursor);

		return allMeetings;
	}

	async getMeetingSummary(recordingId: string): Promise<FathomSummary> {
		const response = await this.request<{ summary: FathomSummary }>(
			`/recordings/${recordingId}/summary`,
		);
		return response.summary;
	}

	async getMeetingTranscript(recordingId: string): Promise<FathomTranscriptItem[]> {
		const response = await this.request<{ transcript: FathomTranscriptItem[] }>(
			`/recordings/${recordingId}/transcript`,
		);
		return response.transcript;
	}
}

export function formatMeetingDate(meeting: FathomMeeting): string {
	const date = new Date(meeting.started_at ?? meeting.created_at);
	return date.toISOString().split("T")[0] ?? "";
}

export function formatMeetingTime(meeting: FathomMeeting): string {
	const date = new Date(meeting.started_at ?? meeting.created_at);
	return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function formatDuration(seconds: number): string {
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	if (h > 0) return `${h}h ${m}m`;
	return `${m}m`;
}

export function meetingToFullNote(meeting: FathomMeeting, summary: FathomSummary | null, transcript: FathomTranscriptItem[] | null): string {
	const date = formatMeetingDate(meeting);
	const time = formatMeetingTime(meeting);
	const duration = meeting.duration_seconds ? formatDuration(meeting.duration_seconds) : "";

	const lines: string[] = [];

	lines.push(`# ${meeting.title || "Untitled Meeting"}`);
	lines.push("");
	lines.push("---");
	lines.push(`date: ${date}`);
	lines.push(`time: ${time}`);
	if (duration) lines.push(`duration: ${duration}`);
	if (meeting.attendees && meeting.attendees.length > 0) {
		const names = meeting.attendees.map((a) => a.name).join(", ");
		lines.push(`attendees: [${names}]`);
	}
	lines.push(`fathom_id: ${meeting.id}`);
	lines.push("---");
	lines.push("");

	if (meeting.attendees && meeting.attendees.length > 0) {
		lines.push("## Attendees");
		for (const a of meeting.attendees) {
			lines.push(`- ${a.name}${a.email ? ` (${a.email})` : ""}`);
		}
		lines.push("");
	}

	if (summary) {
		if (summary.short_summary) {
			lines.push("## Summary");
			lines.push(summary.short_summary);
			lines.push("");
		}

		if (summary.long_summary) {
			lines.push("## Details");
			lines.push(summary.long_summary);
			lines.push("");
		}

		if (summary.topics && summary.topics.length > 0) {
			lines.push("## Topics");
			for (const topic of summary.topics) {
				lines.push(`- ${topic}`);
			}
			lines.push("");
		}
	}

	const actionItems = summary?.action_items ?? meeting.action_items ?? [];
	if (actionItems.length > 0) {
		lines.push("## Action Items");
		for (const item of actionItems) {
			const assignee = item.assignee ? ` *(${item.assignee})*` : "";
			lines.push(`- [ ] ${item.text}${assignee}`);
		}
		lines.push("");
	}

	if (transcript && transcript.length > 0) {
		lines.push("## Transcript");
		lines.push("");
		let lastSpeaker = "";
		for (const item of transcript) {
			if (item.speaker !== lastSpeaker) {
				lines.push(`**${item.speaker}**`);
				lastSpeaker = item.speaker;
			}
			lines.push(item.text);
			lines.push("");
		}
	}

	return lines.join("\n");
}

export function meetingToBulletPoints(meeting: FathomMeeting, summary: FathomSummary | null): string {
	const date = formatMeetingDate(meeting);
	const time = formatMeetingTime(meeting);
	const duration = meeting.duration_seconds ? ` (${formatDuration(meeting.duration_seconds)})` : "";

	const lines: string[] = [];

	lines.push(`- **${meeting.title || "Untitled Meeting"}** — ${date} at ${time}${duration}`);

	if (meeting.attendees && meeting.attendees.length > 0) {
		const names = meeting.attendees.map((a) => a.name).join(", ");
		lines.push(`\t- Attendees: ${names}`);
	}

	if (summary?.short_summary) {
		lines.push(`\t- ${summary.short_summary}`);
	}

	const actionItems = summary?.action_items ?? meeting.action_items ?? [];
	if (actionItems.length > 0) {
		lines.push("\t- Action items:");
		for (const item of actionItems) {
			const assignee = item.assignee ? ` *(${item.assignee})*` : "";
			lines.push(`\t\t- [ ] ${item.text}${assignee}`);
		}
	}

	return lines.join("\n");
}
