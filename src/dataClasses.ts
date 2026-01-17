

/**
 * Data models for edge-tts.
 */

export class TTSConfig {
    voice: string;
    rate: string;
    volume: string;
    pitch: string;
    boundary: "WordBoundary" | "SentenceBoundary" | null;

    constructor(
        voice: string,
        rate: string,
        volume: string,
        pitch: string,
        boundary: "WordBoundary" | "SentenceBoundary" | null = null
    ) {
        this.voice = voice;
        this.rate = rate;
        this.volume = volume;
        this.pitch = pitch;
        this.boundary = boundary;

        this.postInit();
    }

    static validateStringParam(
        paramName: string,
        paramValue: string,
        pattern: RegExp
    ): string {
        if (typeof paramValue !== "string") {
            throw new TypeError(`${paramName} must be str`);
        }
        if (!pattern.test(paramValue)) {
            throw new Error(`Invalid ${paramName} '${paramValue}'.`);
        }
        return paramValue;
    }

    private postInit() {
        // Possible values for voice are:
        // - Microsoft Server Speech Text to Speech Voice (cy-GB, NiaNeural)
        // - cy-GB-NiaNeural
        // - fil-PH-AngeloNeural
        // Always send the first variant as that is what Microsoft Edge does.
        if (typeof this.voice !== "string") {
            throw new TypeError("voice must be str");
        }

        const match = /^([a-z]{2,})-([A-Z]{2,})-(.+Neural)$/.exec(this.voice);
        if (match) {
            const lang = match[1];
            let region = match[2];
            let name = match[3];
            if (name.includes("-")) {
                region = `${region}-${name.substring(0, name.indexOf("-"))}`;
                name = name.substring(name.indexOf("-") + 1);
            }
            this.voice = `Microsoft Server Speech Text to Speech Voice (${lang}-${region}, ${name})`;
        }

        // Validate the rate, volume, and pitch parameters.
        TTSConfig.validateStringParam(
            "voice",
            this.voice,
            /^Microsoft Server Speech Text to Speech Voice \(.+,.+\)$/
        );
        TTSConfig.validateStringParam("rate", this.rate, /^[+-]\d+%$/);
        TTSConfig.validateStringParam("volume", this.volume, /^[+-]\d+%$/);
        TTSConfig.validateStringParam("pitch", this.pitch, /^[+-]\d+Hz$/);
    }
}
