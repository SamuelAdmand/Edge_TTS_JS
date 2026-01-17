import { compose, Subtitle } from "./srtComposer.js";
import { TTSChunk } from "./types.js";

/**
 * SubMaker is used to generate subtitles from WordBoundary and SentenceBoundary messages.
 */
export class SubMaker {
    cues: Subtitle[] = [];
    type: string | null = null;

    feed(msg: TTSChunk): void {
        if (msg.type !== "WordBoundary" && msg.type !== "SentenceBoundary") {
            throw new Error(
                "Invalid message type, expected 'WordBoundary' or 'SentenceBoundary'."
            );
        }

        if (this.type === null) {
            this.type = msg.type;
        } else if (this.type !== msg.type) {
            throw new Error(
                `Expected message type '${this.type}', but got '${msg.type}'.`
            );
        }

        if (msg.offset === undefined || msg.duration === undefined || msg.text === undefined) {
            // Should not happen based on types, but runtime check
            return;
        }

        // msg.offset is in ticks (100ns). 
        // We want milliseconds.
        // 1 tick = 0.1 microseconds.
        // 1 ms = 1000 microseconds = 10,000 ticks.
        const startMs = msg.offset / 10000;
        const durationMs = msg.duration / 10000;
        const endMs = startMs + durationMs;

        this.cues.push(
            new Subtitle(
                this.cues.length + 1,
                startMs,
                endMs,
                msg.text
            )
        );
    }

    getSrt(): string {
        return compose(this.cues);
    }
}
