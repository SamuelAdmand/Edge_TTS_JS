import { createHash, randomBytes } from "crypto";
import { TRUSTED_CLIENT_TOKEN } from "./constants.js";
import { SkewAdjustmentError } from "./exceptions.js";

const WIN_EPOCH = 11644473600;
const S_TO_NS = 1e9;

export class DRM {
    private static clockSkewSeconds: number = 0.0;

    static adjClockSkewSeconds(skewSeconds: number): void {
        this.clockSkewSeconds += skewSeconds;
    }

    static getUnixTimestamp(): number {
        return Date.now() / 1000 + this.clockSkewSeconds;
    }

    static parseRfc2616Date(date: string): number | null {
        try {
            const timestamp = Date.parse(date);
            if (isNaN(timestamp)) {
                return null;
            }
            return timestamp / 1000;
        } catch {
            return null;
        }
    }

    static handleClientResponseError(headers: Record<string, any>): void {
        // Note: Python handled aiohttp error, here we just take headers.
        // Call this in the catch block of axios/fetch.
        const serverDate = headers["date"] || headers["Date"];
        if (!serverDate || typeof serverDate !== "string") {
            throw new SkewAdjustmentError("No server date in headers.");
        }
        const serverDateParsed = this.parseRfc2616Date(serverDate);
        if (serverDateParsed === null) {
            throw new SkewAdjustmentError(
                `Failed to parse server date: ${serverDate}`
            );
        }
        const clientDate = this.getUnixTimestamp();
        this.adjClockSkewSeconds(serverDateParsed - clientDate);
    }

    static generateSecMsGec(): string {
        let ticks = this.getUnixTimestamp();
        ticks += WIN_EPOCH;
        ticks -= ticks % 300;
        ticks *= S_TO_NS / 100;

        const strToHash = `${ticks.toFixed(0)}${TRUSTED_CLIENT_TOKEN}`;
        return createHash("sha256").update(strToHash, "ascii").digest("hex").toUpperCase();
    }

    static generateMuid(): string {
        return randomBytes(16).toString("hex").toUpperCase();
    }

    static headersWithMuid(headers: Record<string, string>): Record<string, string> {
        const combinedHeaders = { ...headers };
        if (combinedHeaders["Cookie"]) {
            throw new Error("Cookie already exists in headers");
        }
        combinedHeaders["Cookie"] = `muid=${this.generateMuid()};`;
        return combinedHeaders;
    }
}
