# Edge TTS JS

A TypeScript port of the `edge-tts` Python library. This library allows you to use Microsoft Edge's online text-to-speech service from Node.js (and potentially browsers with some modifications).

## Installation

### From GitHub

You can install this library directly from GitHub:

```bash
npm install github:SamuelAdmand/Edge_TTS_JS
```

### Locally

You can also install it directly from the local file system for development:

```bash
npm install /path/to/Edge_TTS_JS
```

### From NPM (If published)

```bash
npm install edge-tts-js
```

## Usage

```typescript
import { Communicate, listVoices } from "edge-tts-js";

async function main() {
  // 1. List available voices
  const voices = await listVoices();
  console.log(voices);

  // 2. Create a Communicate instance
  const tts = new Communicate("Hello world", "en-US-EmmaMultilingualNeural");

  // 3. Stream audio
  for await (const chunk of tts.stream()) {
    if (chunk.type === "audio") {
      // chunk.data is a Buffer of MP3 audio
      console.log("Received audio chunk", chunk.data.length);
    }
  }
}

main();
```

## Building

To build the project:

```bash
npm run build
```

This will compile the TypeScript code in `src/` to JavaScript in `dist/`.

## License

MIT
