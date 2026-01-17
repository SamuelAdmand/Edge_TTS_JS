/**
 * Custom types for edge-tts.
 */

export interface TTSChunk {
    type: "audio" | "WordBoundary" | "SentenceBoundary";
    data?: Buffer | Uint8Array;
    duration?: number;
    offset?: number;
    text?: string;
}

export interface VoiceTag {
    ContentCategories: string[];
    VoicePersonalities: string[];
}

export interface Voice {
    Name: string;
    ShortName: string;
    Gender: "Female" | "Male";
    Locale: string;
    SuggestedCodec: string;
    FriendlyName: string;
    Status: "Deprecated" | "GA" | "Preview";
    VoiceTag: VoiceTag;
}

export interface VoicesManagerVoice extends Voice {
    Language: string;
}

export interface VoicesManagerFind {
    Gender?: "Female" | "Male";
    Locale?: string;
    Language?: string;
}

export interface CommunicateState {
    partial_text: string | null; // bytes in python but effectively string buffer
    offset_compensation: number;
    last_duration_offset: number;
    stream_was_called: boolean;
}
