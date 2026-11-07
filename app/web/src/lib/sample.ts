// Embedded at build time (Vite `?raw`), so "Load sample transcript" works with no API and no network.
import sample from "../../../../fixtures/transcripts/synthetic_advisory_board_01.txt?raw";

export const SAMPLE_TRANSCRIPT: string = sample;
export const SAMPLE_TITLE = "Synthetic advisory board 01 (oncology, Oct 2026)";
