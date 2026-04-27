import { requestUrl } from "obsidian";

const FATHOM_API_BASE = "https://api.fathom.ai/external/v1";

export interface FathomUser {
	name: string;
	email: string;
	email_domain: string;
	team: string | null;
}

export interface FathomInvitee {
	name: string | null;
	matched_speaker_display_name: string | null;
	email: string | null;
	email_domain: string | null;
	is_external: boolean;
}

export interface FathomSummary {
	template_name: string | null;
	markdown_formatted: string | null;
}

export interface FathomTranscriptItem {
	speaker: {
		display_name: string;
		matched_calendar_invitee_email: string | null;
	};
	text: string;
	timestamp: string;
}

export interface FathomActionItem {
	description: string;
	user_generated: boolean;
	completed: boolean;
	recording_timestamp: string;
	recording_playback_url: string;
	assignee: {
		name: string | null;
		email: string | null;
		team: string | null;
	};
}

export interface FathomMeeting {
	recording_id: number;
	title: string;
	meeting_title: string | null;
	url: string;
	share_url: string;
	created_at: string;
	scheduled_start_time: string | null;
	scheduled_end_time: string | null;
	recording_start_time: string | null;
	recording_end_time: string | null;
	calendar_invitees_domains_type: "only_internal" | "one_or_more_external";
	recorded_by: FathomUser;
	transcript_language: string;
	calendar_invitees: FathomInvitee[];
	transcript?: FathomTranscriptItem[] | null;
	default_summary?: FathomSummary | null;
	action_items?: FathomActionItem[] | null;
}

export interface FathomMeetingListResponse {
	items: FathomMeeting[];
	next_cursor: string | null;
	limit: number | null;
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

		try {
			const response = await requestUrl({
				url: url.toString(),
				method: "GET",
				headers: { "X-Api-Key": this.apiKey },
				throw: false,
			});

			if (response.status < 200 || response.status >= 300) {
				throw new FathomApiError(
					`Fathom API error ${response.status}: ${response.text || "Unknown error"}`,
					response.status,
				);
			}

			return response.json as T;
		} catch (e) {
			if (e instanceof FathomApiError) throw e;
			// Obsidian throws an error with a status property on network failure
			const status = (e as { status?: number }).status ?? 0;
			throw new FathomApiError(
				status ? `Fathom API error ${status}` : `Network error: ${(e as Error).message}`,
				status,
			);
		}
	}

	async listMeetings(options: {
		cursor?: string;
		createdAfter?: string;
		createdBefore?: string;
		includeSummary?: boolean;
		includeActionItems?: boolean;
		includeTranscript?: boolean;
	} = {}): Promise<FathomMeetingListResponse> {
		const params: Record<string, string> = {};
		if (options.cursor) params["cursor"] = options.cursor;
		if (options.createdAfter) params["created_after"] = options.createdAfter;
		if (options.createdBefore) params["created_before"] = options.createdBefore;
		if (options.includeSummary) params["include_summary"] = "true";
		if (options.includeActionItems) params["include_action_items"] = "true";
		if (options.includeTranscript) params["include_transcript"] = "true";

		return this.request<FathomMeetingListResponse>("/meetings", params);
	}

	async listAllMeetings(options: {
		createdAfter?: string;
		includeSummary?: boolean;
		includeActionItems?: boolean;
		includeTranscript?: boolean;
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
				includeTranscript: options.includeTranscript,
			});

			allMeetings.push(...response.items);
			cursor = response.next_cursor ?? undefined;

			if (options.onPage) options.onPage(allMeetings.length);
		} while (cursor);

		return allMeetings;
	}

	async getMeetingSummary(recordingId: number): Promise<FathomSummary | null> {
		const response = await this.request<{ summary?: FathomSummary }>(
			`/recordings/${recordingId}/summary`,
		);
		return response.summary ?? null;
	}

	async getMeetingTranscript(recordingId: number): Promise<FathomTranscriptItem[]> {
		const response = await this.request<{ transcript?: FathomTranscriptItem[] }>(
			`/recordings/${recordingId}/transcript`,
		);
		return response.transcript ?? [];
	}
}

export function formatMeetingDate(meeting: FathomMeeting): string {
	const raw = meeting.recording_start_time ?? meeting.created_at;
	const date = new Date(raw);
	return date.toISOString().split("T")[0] ?? "";
}

export function formatMeetingTime(meeting: FathomMeeting): string {
	const raw = meeting.recording_start_time ?? meeting.created_at;
	const date = new Date(raw);
	return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function formatDuration(meeting: FathomMeeting): string {
	if (!meeting.recording_start_time || !meeting.recording_end_time) return "";
	const start = new Date(meeting.recording_start_time).getTime();
	const end = new Date(meeting.recording_end_time).getTime();
	if (isNaN(start) || isNaN(end) || end <= start) return "";
	const totalSeconds = Math.round((end - start) / 1000);
	const h = Math.floor(totalSeconds / 3600);
	const m = Math.floor((totalSeconds % 3600) / 60);
	if (h > 0) return `${h}h ${m}m`;
	return `${m}m`;
}

export function meetingDisplayTitle(meeting: FathomMeeting): string {
	return meeting.title || meeting.meeting_title || "Untitled Meeting";
}

function yamlQuote(value: string): string {
	// Quote if value contains characters that would break YAML
	if (/[:#\[\]{},&*!|>'"%@`\n]/.test(value) || value.trim() !== value) {
		return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
	}
	return value;
}

function stripMarkdown(text: string): string {
	return text
		.replace(/[*_~`#>\[\]]/g, "")
		.replace(/\s+/g, " ")
		.trim();
}

export function meetingToFullNote(
	meeting: FathomMeeting,
	summary: FathomSummary | null,
	transcript: FathomTranscriptItem[] | null,
): string {
	const date = formatMeetingDate(meeting);
	const time = formatMeetingTime(meeting);
	const duration = formatDuration(meeting);
	const title = meetingDisplayTitle(meeting);

	const lines: string[] = [];

	lines.push(`# ${title}`);
	lines.push("");
	lines.push("---");
	lines.push(`date: ${date}`);
	lines.push(`time: ${yamlQuote(time)}`);
	if (duration) lines.push(`duration: ${duration}`);
	const inviteeNames = meeting.calendar_invitees
		.map((i) => i.name ?? i.email ?? "Unknown")
		.filter(Boolean);
	if (inviteeNames.length > 0) {
		const quotedNames = inviteeNames.map(yamlQuote).join(", ");
		lines.push(`attendees: [${quotedNames}]`);
	}
	lines.push(`recorded_by: ${yamlQuote(meeting.recorded_by.name)}`);
	lines.push(`fathom_id: ${meeting.recording_id}`);
	lines.push(`fathom_url: ${yamlQuote(meeting.url)}`);
	lines.push("---");
	lines.push("");

	if (meeting.calendar_invitees.length > 0) {
		lines.push("## Attendees");
		for (const i of meeting.calendar_invitees) {
			const name = i.name ?? i.email ?? "Unknown";
			const email = i.email ? ` (${i.email})` : "";
			const ext = i.is_external ? " 🌐" : "";
			lines.push(`- ${name}${email}${ext}`);
		}
		lines.push("");
	}

	if (summary?.markdown_formatted) {
		lines.push("## Summary");
		lines.push(summary.markdown_formatted);
		lines.push("");
	}

	const actionItems = meeting.action_items ?? [];
	if (actionItems.length > 0) {
		lines.push("## Action Items");
		for (const item of actionItems) {
			const check = item.completed ? "x" : " ";
			const assignee = item.assignee.name ? ` *(${item.assignee.name})*` : "";
			lines.push(`- [${check}] ${item.description}${assignee}`);
		}
		lines.push("");
	}

	if (transcript && transcript.length > 0) {
		lines.push("## Transcript");
		lines.push("");
		let lastSpeaker = "";
		for (const item of transcript) {
			const speaker = item.speaker.display_name;
			if (speaker !== lastSpeaker) {
				lines.push(`**${speaker}** *${item.timestamp}*`);
				lastSpeaker = speaker;
			}
			lines.push(item.text);
			lines.push("");
		}
	}

	return lines.join("\n");
}

export function meetingToBulletPoints(
	meeting: FathomMeeting,
	summary: FathomSummary | null,
): string {
	const date = formatMeetingDate(meeting);
	const time = formatMeetingTime(meeting);
	const duration = formatDuration(meeting);
	const title = meetingDisplayTitle(meeting);
	const durationStr = duration ? ` (${duration})` : "";

	const lines: string[] = [];

	lines.push(`- **${title}** — ${date} at ${time}${durationStr}`);

	const names = meeting.calendar_invitees
		.map((i) => i.name ?? i.email)
		.filter(Boolean)
		.join(", ");
	if (names) lines.push(`\t- Attendees: ${names}`);

	if (summary?.markdown_formatted) {
		const firstPara = summary.markdown_formatted.split("\n\n")[0]?.trim();
		if (firstPara) lines.push(`\t- ${stripMarkdown(firstPara)}`);
	}

	const actionItems = meeting.action_items ?? [];
	if (actionItems.length > 0) {
		lines.push("\t- Action items:");
		for (const item of actionItems) {
			const check = item.completed ? "x" : " ";
			const assignee = item.assignee.name ? ` *(${item.assignee.name})*` : "";
			lines.push(`\t\t- [${check}] ${item.description}${assignee}`);
		}
	}

	return lines.join("\n");
}
