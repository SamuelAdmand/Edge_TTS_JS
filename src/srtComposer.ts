/**
 * A tiny library for composing SRT files.
 */

export class Subtitle {
    index: number;
    start: number; // in milliseconds
    end: number; // in milliseconds
    content: string;

    constructor(index: number, start: number, end: number, content: string) {
        this.index = index;
        this.start = start;
        this.end = end;
        this.content = content;
    }

    toSrt(eol: string = "\n"): string {
        let outputContent = makeLegalContent(this.content);

        if (eol !== "\n") {
            outputContent = outputContent.replace(/\n/g, eol);
        }

        // {idx}{eol}{start} --> {end}{eol}{content}{eol}{eol}
        return (
            `${this.index}${eol}` +
            `${timestampToSrt(this.start)} --> ${timestampToSrt(this.end)}${eol}` +
            `${outputContent}${eol}${eol}`
        );
    }
}

export function makeLegalContent(content: string): string {
    if (content && content[0] !== "\n" && !content.includes("\n\n")) {
        return content;
    }
    return content.replace(/\n\n+/g, "\n").replace(/^\n|\n$/g, "");
}

export function timestampToSrt(milliseconds: number): string {
    const seconds = Math.floor(milliseconds / 1000);
    const msecs = Math.round(milliseconds % 1000);

    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    const pHrs = hrs.toString().padStart(2, "0");
    const pMins = mins.toString().padStart(2, "0");
    const pSecs = secs.toString().padStart(2, "0");
    const pMsecs = msecs.toString().padStart(3, "0");

    return `${pHrs}:${pMins}:${pSecs},${pMsecs}`;
}

export function compose(subtitles: Subtitle[], eol: string = "\n"): string {
    // Sort by start time.
    const sortedSubs = [...subtitles].sort((a, b) => a.start - b.start);

    // Reindex
    sortedSubs.forEach((sub, i) => {
        sub.index = i + 1;
    });

    return sortedSubs.map((sub) => sub.toSrt(eol)).join("");
}
