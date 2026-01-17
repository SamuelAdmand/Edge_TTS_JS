import { Buffer } from "buffer";
import { v4 as uuidv4 } from "uuid";
import WebSocket from "ws";
import {
    DEFAULT_VOICE,
    SEC_MS_GEC_VERSION,
    WSS_HEADERS,
    WSS_URL,
} from "./constants.js";
import { TTSConfig } from "./dataClasses.js";
import { DRM } from "./drm.js";
import {
    NoAudioReceived,
    UnexpectedResponse,
    UnknownResponse,
    WebSocketError,
} from "./exceptions.js";
import { CommunicateState, TTSChunk } from "./types.js";

function getHeadersAndData(
    data: Buffer,
    headerLength: number
): { headers: Record<string, string>; data: Buffer } {
    const headers: Record<string, string> = {};
    const headerText = data.subarray(0, headerLength).toString("utf-8");
    const lines = headerText.split("\r\n");

    for (const line of lines) {
        if (!line) continue;
        const [key, value] = line.split(":", 2);
        if (key && value) {
            headers[key] = value;
        }
    }

    return { headers, data: data.subarray(headerLength + 2) };
}

function removeIncompatibleCharacters(text: string): string {
    let chars = text.split("");
    for (let i = 0; i < chars.length; i++) {
        const code = chars[i].charCodeAt(0);
        if (
            (code >= 0 && code <= 8) ||
            (code >= 11 && code <= 12) ||
            (code >= 14 && code <= 31)
        ) {
            chars[i] = " ";
        }
    }
    return chars.join("");
}

function connectId(): string {
    return uuidv4().replace(/-/g, "");
}

function escapeXml(unsafe: string): string {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    //.replace(/"/g, "&quot;")
    //.replace(/'/g, "&apos;");
}

function unescapeXml(safe: string): string {
    return safe
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&");
}

function findLastNewlineOrSpaceWithinLimit(
    text: Buffer,
    limit: number
): number {
    const slice = text.subarray(0, limit);
    let idx = slice.lastIndexOf("\n");
    if (idx === -1) {
        idx = slice.lastIndexOf(" ");
    }
    return idx;
}

function findSafeUtf8SplitPoint(textSegment: Buffer): number {
    let splitAt = textSegment.length;
    while (splitAt > 0) {
        try {
            // Check if valid UTF-8 by trying to decode just before the split
            const check = textSegment.subarray(0, splitAt).toString("utf-8");
            // Double check by encoding back? No, Buffer.toString handles incomplete sequences by replacement char usually,
            // but we want to know if it ends cleanly.
            // Actually, standard way is checking high bit patterns.
            // 0xxxxxxx (0-127) - 1 byte
            // 110xxxxx - start of 2 byte
            // 1110xxxx - start of 3 byte
            // 11110xxx - start of 4 byte
            // 10xxxxxx - continuation
            const byte = textSegment[splitAt - 1];
            if ((byte & 0xc0) !== 0x80) {
                // Not a continuation byte, effectively means we are at end of a character sequence or start of new one.
                // Wait, if last byte is start of multi-byte, we shouldn't split AFTER it if we don't have the rest.
                // If we split AT `splitAt`, we take `0` to `splitAt`. `splitAt` is exclusive end.
                // So `textSegment[splitAt-1]` is the last byte included.
                // Ideally we want the last included byte to be the end of a char.
                // Simple check: Convert to string and back. If length matches, it's valid.
                const chunk = textSegment.subarray(0, splitAt);
                const str = chunk.toString("utf-8");
                if (Buffer.from(str).length === chunk.length) {
                    return splitAt;
                }
            }
        } catch (e) { }
        splitAt--;
    }
    return splitAt;
}

function adjustSplitPointForXmlEntity(text: Buffer, splitAt: number): number {
    // Look for '&' before splitAt
    const chunk = text.subarray(0, splitAt);
    const ampIndex = chunk.lastIndexOf("&");
    if (ampIndex !== -1) {
        // Check if there implies a semicolon after
        const sliceAfterAmp = chunk.subarray(ampIndex);
        if (!sliceAfterAmp.includes(";")) {
            // Unterminated, move split back to ampersand
            return ampIndex;
        }
    }
    return splitAt;
}

function* splitTextByByteLength(
    text: string | Buffer,
    byteLength: number
): Generator<Buffer, void, void> {
    let buf = typeof text === "string" ? Buffer.from(text, "utf-8") : text;
    if (byteLength <= 0) throw new Error("byte_length must be > 0");

    while (buf.length > byteLength) {
        let splitAt = findLastNewlineOrSpaceWithinLimit(buf, byteLength);
        if (splitAt < 0) {
            splitAt = findSafeUtf8SplitPoint(buf.subarray(0, byteLength));
        }
        splitAt = adjustSplitPointForXmlEntity(buf, splitAt);

        if (splitAt <= 0) {
            // Fallback or error. Use byteLength if safer options fail but ensure UTF safe?
            // Python raises ValueError.
            // We attempt to find ANY safe point.
            // If simply `splitAt` gave 0, try finding forced safe point at limit?
            const forcedSafe = findSafeUtf8SplitPoint(buf.subarray(0, byteLength));
            if (forcedSafe > 0) splitAt = forcedSafe;
            else throw new Error("Could not find split point");
        }

        const chunk = buf.subarray(0, splitAt).toString().trim();
        if (chunk.length > 0) {
            yield Buffer.from(chunk);
        }
        buf = buf.subarray(splitAt > 0 ? splitAt : 1);
    }

    const remaining = buf.toString().trim();
    if (remaining.length > 0) {
        yield Buffer.from(remaining);
    }
}

function dateToString(): string {
    // Format: Sat Jan 17 2026 16:15:00 GMT+0000 (Coordinated Universal Time)
    const d = new Date();
    // We need UTC.
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    const dayName = days[d.getUTCDay()];
    const monthName = months[d.getUTCMonth()];
    const day = d.getUTCDate().toString().padStart(2, "0");
    const year = d.getUTCFullYear();
    const hrs = d.getUTCHours().toString().padStart(2, "0");
    const min = d.getUTCMinutes().toString().padStart(2, "0");
    const sec = d.getUTCSeconds().toString().padStart(2, "0");

    return `${dayName} ${monthName} ${day} ${year} ${hrs}:${min}:${sec} GMT+0000 (Coordinated Universal Time)`;
}

function mkssml(tc: TTSConfig, escapedText: string): string {
    return (
        `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>` +
        `<voice name='${tc.voice}'>` +
        `<prosody pitch='${tc.pitch}' rate='${tc.rate}' volume='${tc.volume}'>` +
        `${escapedText}` +
        `</prosody>` +
        `</voice>` +
        `</speak>`
    );
}

function ssmlHeadersPlusData(
    requestId: string,
    timestamp: string,
    ssml: string
): string {
    return (
        `X-RequestId:${requestId}\r\n` +
        `Content-Type:application/ssml+xml\r\n` +
        `X-Timestamp:${timestamp}Z\r\n` +
        `Path:ssml\r\n\r\n` +
        `${ssml}`
    );
}

export class Communicate {
    private ttsConfig: TTSConfig;
    private texts: Buffer[];
    private proxy?: string;
    private ws: WebSocket | null = null;
    private state: CommunicateState;

    constructor(
        text: string,
        voice: string = DEFAULT_VOICE,
        rate: string = "+0%",
        volume: string = "+0%",
        pitch: string = "+0Hz",
        boundary: "WordBoundary" | "SentenceBoundary" = "SentenceBoundary",
        proxy?: string
    ) {
        this.ttsConfig = new TTSConfig(voice, rate, volume, pitch, boundary);
        this.texts = Array.from(
            splitTextByByteLength(escapeXml(removeIncompatibleCharacters(text)), 4096)
        );
        this.proxy = proxy;

        this.state = {
            partial_text: null,
            offset_compensation: 0,
            last_duration_offset: 0,
            stream_was_called: false,
        };
    }

    private parseMetadata(data: Buffer): TTSChunk {
        const jsonStr = data.toString("utf-8");
        const jsonObj = JSON.parse(jsonStr);

        for (const metaObj of jsonObj.Metadata) {
            const metaType = metaObj.Type;
            if (metaType === "WordBoundary" || metaType === "SentenceBoundary") {
                const currentOffset = metaObj.Data.Offset + this.state.offset_compensation;
                const currentDuration = metaObj.Data.Duration;
                return {
                    type: metaType,
                    offset: currentOffset,
                    duration: currentDuration,
                    text: unescapeXml(metaObj.Data.text.Text)
                };
            }
            if (metaType === "SessionEnd") continue;
            throw new UnknownResponse(`Unknown metadata type: ${metaType}`);
        }
        throw new UnexpectedResponse("No WordBoundary metadata found");
    }

    private async *__stream(): AsyncGenerator<TTSChunk, void, void> {
        const connectPromise = new Promise<void>((resolve, reject) => {
            const secMsGec = DRM.generateSecMsGec();
            const url = `${WSS_URL}&ConnectionId=${connectId()}&Sec-MS-GEC=${secMsGec}&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}`;
            const headers = DRM.headersWithMuid(WSS_HEADERS);

            const options: any = { headers };
            if (this.proxy) {
                // Requires https-proxy-agent if this.proxy is http/https url
                // For now assume user configured environment or ignored if simply string
                // TODO: Add agent support
            }

            this.ws = new WebSocket(url, options);

            this.ws.on("open", () => resolve());

            this.ws.on("unexpected-response", (req, res) => {
                if (res.statusCode === 403) {
                    // 403 Forbidden. 
                    // We can't automatically retry inside constructor or stream easily without reconnection logic.
                    // We will reject with a specific error so caller or wrapper can handle DRM adjustment.
                    // But wait, Python does it inside `stream` loop by catching `aiohttp.ClientResponseError`.
                    // Here `unexpected-response` happens during handshake.
                    const date = res.headers["date"];
                    if (date) {
                        try {
                            DRM.handleClientResponseError({ Date: date });
                        } catch (e) { console.error("DRM error", e); }
                    }
                    reject(new Error("403 Forbidden")); // Signal to retry?
                } else {
                    reject(new Error(`WebSocket error: ${res.statusCode} ${res.statusMessage}`));
                }
            });

            this.ws.on("error", (err) => reject(new WebSocketError(err.message)));
        });

        await connectPromise;

        if (!this.ws) throw new Error("WebSocket not initialized");

        // Send Command Request
        const wordBoundary = this.ttsConfig.boundary === "WordBoundary";
        const wd = wordBoundary ? "true" : "false";
        const sq = !wordBoundary ? "true" : "false";

        this.ws.send(
            `X-Timestamp:${dateToString()}\r\n` +
            `Content-Type:application/json; charset=utf-8\r\n` +
            `Path:speech.config\r\n\r\n` +
            `{"context":{"synthesis":{"audio":{"metadataoptions":{` +
            `"sentenceBoundaryEnabled":"${sq}","wordBoundaryEnabled":"${wd}"` +
            `},` +
            `"outputFormat":"audio-24khz-48kbitrate-mono-mp3"` +
            `}}}}` +
            `\r\n`
        );

        // Send SSML Request
        if (!this.state.partial_text) throw new Error("No text to synthesize");

        this.ws.send(
            ssmlHeadersPlusData(
                connectId(),
                dateToString(),
                mkssml(this.ttsConfig, this.state.partial_text)
            )
        );

        // Listen for messages using an async iterator approach or event listener queue
        // Since `ws` is event based, we push to a queue.
        const messageQueue: any[] = [];
        let resolveQueue: ((val?: any) => void) | null = null;
        let rejectQueue: ((err: any) => void) | null = null;
        let finished = false;

        this.ws.on("message", (data: Buffer, isBinary: boolean) => {
            if (isBinary) {
                messageQueue.push({ type: 'binary', data });
            } else {
                messageQueue.push({ type: 'text', data: data.toString() });
            }
            if (resolveQueue) {
                const r = resolveQueue;
                resolveQueue = null;
                r();
            }
        });

        this.ws.on("close", () => {
            finished = true;
            if (resolveQueue) resolveQueue();
        });

        this.ws.on("error", (err) => {
            if (rejectQueue) rejectQueue(err);
        });

        let audioWasReceived = false;

        while (!finished || messageQueue.length > 0) {
            if (messageQueue.length === 0) {
                await new Promise<void>((resolve, reject) => {
                    resolveQueue = resolve;
                    rejectQueue = reject;
                });
                if (messageQueue.length === 0 && finished) break;
            }

            const msg = messageQueue.shift();
            if (!msg) continue;

            if (msg.type === 'text') {
                const textData = msg.data;
                const separator = "\r\n\r\n";
                const idx = textData.indexOf(separator);

                if (idx !== -1) {
                    const headersPart = Buffer.from(textData.substring(0, idx)); // Need bytes for header parser or just string split
                    // Use simple string parse for text messages
                    const headersObj: Record<string, string> = {};
                    textData.substring(0, idx).split("\r\n").forEach((line: string) => {
                        const [k, v] = line.split(":", 2);
                        if (k) headersObj[k] = v;
                    });

                    const dataPart = textData.substring(idx + separator.length);
                    const path = headersObj["Path"];

                    if (path === "audio.metadata") {
                        const parsed = this.parseMetadata(Buffer.from(dataPart));
                        yield parsed;
                        this.state.last_duration_offset = parsed.offset! + parsed.duration!;
                    } else if (path === "turn.end") {
                        this.state.offset_compensation = this.state.last_duration_offset;
                        this.state.offset_compensation += 8_750_000;
                        // We should stop listening for this text chunk?
                        // Python breaks loop here.
                        // But we are inside __stream which handles ONE text chunk logic?
                        // No, __stream handles ONE connection session.
                        // Python loop: `async for received in websocket:`
                        // If turn.end, `break`.
                        // This means we are done with THIS SSML request.
                        this.ws?.close(); // Or just break loop?
                        finished = true;
                        break;
                    }
                    // Ignore response or turn.start
                }

            } else if (msg.type === 'binary') {
                const data = msg.data as Buffer;
                if (data.length < 2) throw new UnexpectedResponse("Binary message too short");
                const headerLength = data.readUInt16BE(0);
                const { headers, data: content } = getHeadersAndData(data, headerLength);

                if (headers["Path"] !== "audio") throw new UnexpectedResponse("Binary path is not audio");
                const contentType = headers["Content-Type"];

                // Content-Type can be undefined/null effectively in header parser if missing. 
                // Node 'buffer' based parser above returns string values.

                if (!contentType && content.length === 0) continue; // Empty audio OK
                if (!contentType && content.length > 0) throw new UnexpectedResponse("No Content-Type with data");
                if (contentType !== "audio/mpeg" && contentType !== undefined) throw new UnexpectedResponse("Unexpected Content-Type");

                if (content.length === 0) {
                    // Missing audio data
                    throw new UnexpectedResponse("Missing audio data");
                }

                audioWasReceived = true;
                yield { type: "audio", data: content };
            }
        }

        if (!audioWasReceived && !finished) {
            // Not strictly accurate check if we break early??
        }

        if (this.ws.readyState === WebSocket.OPEN) {
            this.ws.close();
        }
    }

    async *stream(): AsyncGenerator<TTSChunk, void, void> {
        if (this.state.stream_was_called) {
            throw new Error("stream can only be called once.");
        }
        this.state.stream_was_called = true;

        for (const textChunk of this.texts) {
            // We cast textChunk Buffer to string for logic?
            // Wait, `this.texts` is Buffer[] from splitTextByByteLength yield Buffer.
            // `mkssml` takes string.
            this.state.partial_text = textChunk.toString("utf-8"); // mkssml uses this string.

            let retry = true;
            while (retry) {
                retry = false;
                try {
                    for await (const message of this.__stream()) {
                        yield message;
                    }
                } catch (e: any) {
                    if (e.message.includes("403")) {
                        // Handled in handshake rejection by DRM update
                        retry = true; // Retry logic
                    } else {
                        throw e;
                    }
                }
            }
        }
    }
}
