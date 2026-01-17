# Edge TTS JS Examples

This guide provides detailed examples of how to use `edge-tts-js` in your Node.js applications.

## Table of Contents
1. [Basic Text-to-Speech](#basic-text-to-speech)
2. [Saving Audio to a File](#saving-audio-to-a-file)
3. [Voice Selection](#voice-selection)
4. [Adjusting Rate, Pitch, and Volume](#adjusting-rate-pitch-and-volume)
5. [Generating Subtitles](#generating-subtitles)

## Basic Text-to-Speech

The simplest usage involves importing `Communicate` and streaming the audio data.

```typescript
import { Communicate } from "edge-tts-js";

async function speak() {
  const tts = new Communicate("Hello, world!");
  
  for await (const chunk of tts.stream()) {
    if (chunk.type === "audio") {
      // chunk.data is a Buffer containing MP3 audio
      process.stdout.write(chunk.data); 
    }
  }
}

speak();
```

## Saving Audio to a File

You can collect all chunks and write them to a file using Node's `fs` module.

```typescript
import { Communicate } from "edge-tts-js";
import fs from "fs";
import { Buffer } from "buffer";

async function saveToFile() {
  const tts = new Communicate("This text will be saved to an MP3 file.");
  const chunks: Buffer[] = [];

  for await (const chunk of tts.stream()) {
    if (chunk.type === "audio") {
      chunks.push(chunk.data);
    }
  }

  const completeAudio = Buffer.concat(chunks);
  fs.writeFileSync("output.mp3", completeAudio);
  console.log("Audio saved to output.mp3");
}

saveToFile();
```

## Voice Selection

You can list all available voices and choose a specific one.

```typescript
import { listVoices, Communicate } from "edge-tts-js";

async function useSpecificVoice() {
  // 1. List voices to find the ShortName you want
  const voices = await listVoices();
  const englishVoice = voices.find(v => v.ShortName === "en-US-ChristopherNeural");

  if (englishVoice) {
    const tts = new Communicate(
        "I am speaking with a specific voice.", 
        englishVoice.ShortName
    );
    // ... stream and play/save audio
  }
}
```

## Adjusting Rate, Pitch, and Volume

You can customize the speech output using standard SSML parameters.

```typescript
import { Communicate } from "edge-tts-js";

async function customSpeech() {
  const tts = new Communicate(
    "Fast and high-pitched speech!",
    "en-US-AriaNeural",
    "+50%",  // rate: 50% faster
    "+20%",  // volume: 20% louder
    "+50Hz"  // pitch: 50Hz higher
  );

  // ... stream and play/save audio
}
```

## Generating Subtitles

The library emits `WordBoundary` events that can be used to generate subtitles or synchronize animations.

```typescript
import { Communicate, SubMaker } from "edge-tts-js";

async function generateSubtitles() {
  const tts = new Communicate("This text will have subtitles generated.");
  const subMaker = new SubMaker();
  const audioChunks = [];

  for await (const chunk of tts.stream()) {
    if (chunk.type === "audio") {
      audioChunks.push(chunk.data);
    } else if (chunk.type === "WordBoundary") {
      // Feed boundary events to SubMaker
      subMaker.feed(chunk);
      
      console.log(`Word: ${chunk.text}, Offset: ${chunk.offset}ms`);
    }
  }

  // Get SRT formatted subtitles
  const srt = subMaker.getSrt();
  console.log("\nGenerated SRT:\n", srt);
}

generateSubtitles();
```
