import axios, { AxiosRequestConfig } from "axios";
import { SEC_MS_GEC_VERSION, VOICE_HEADERS, VOICE_LIST } from "./constants.js";
import { DRM } from "./drm.js";
import { Voice, VoicesManagerFind, VoicesManagerVoice } from "./types.js";

async function __listVoices(proxy?: string): Promise<Voice[]> {
    const secMsGec = DRM.generateSecMsGec();
    const url = `${VOICE_LIST}&Sec-MS-GEC=${secMsGec}&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}`;

    const headers = DRM.headersWithMuid(VOICE_HEADERS);

    const config: AxiosRequestConfig = {
        headers,
        proxy: proxy ? false : undefined, // Axios proxy config is object, string is not direct.
        // If proxy string is provided, we would need to parse it or use https-proxy-agent.
        // For now, ignoring string proxy or expecting user to handle axios config if needed.
        // But to match python interface, we'll keep the param.
    };

    // TODO: Handle proxy string properly if needed.

    const response = await axios.get(url, config);
    const data: Voice[] = response.data;

    data.forEach((voice) => {
        if (!voice.VoiceTag) {
            voice.VoiceTag = { ContentCategories: [], VoicePersonalities: [] };
        }
        if (!voice.VoiceTag.ContentCategories) {
            voice.VoiceTag.ContentCategories = [];
        }
        if (!voice.VoiceTag.VoicePersonalities) {
            voice.VoiceTag.VoicePersonalities = [];
        }
    });

    return data;
}

export async function listVoices(proxy?: string): Promise<Voice[]> {
    try {
        return await __listVoices(proxy);
    } catch (e: any) {
        if (axios.isAxiosError(e) && e.response) {
            if (e.response.status === 403) {
                DRM.handleClientResponseError(e.response.headers);
                return await __listVoices(proxy);
            }
        }
        throw e;
    }
}

export class VoicesManager {
    voices: VoicesManagerVoice[] = [];
    calledCreate: boolean = false;

    constructor() { }

    static async create(customVoices?: Voice[]): Promise<VoicesManager> {
        const instance = new VoicesManager();
        const voices = customVoices || (await listVoices());
        instance.voices = voices.map((voice) => ({
            ...voice,
            Language: voice.Locale.split("-")[0],
        }));
        instance.calledCreate = true;
        return instance;
    }

    find(attributes: VoicesManagerFind): VoicesManagerVoice[] {
        if (!this.calledCreate) {
            throw new Error(
                "VoicesManager.find() called before VoicesManager.create()"
            );
        }

        return this.voices.filter((voice) => {
            for (const [key, value] of Object.entries(attributes)) {
                if (voice[key as keyof VoicesManagerVoice] !== value) {
                    return false;
                }
            }
            return true;
        });
    }
}
