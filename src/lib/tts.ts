import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { HttpError } from "./auth";
import { dataDir } from "./db";

/**
 * Read-aloud via ElevenLabs text-to-speech. Each distinct text is synthesized once and cached as
 * an mp3 under DATA_DIR/tts, so replaying the intro on ten phones costs one API call.
 */

const API = "https://api.elevenlabs.io/v1/text-to-speech";
// A premade voice every account has; multilingual models read every supported language with it.
const DEFAULT_VOICE = "JBFqnCBsd6RMkjVDRZzb";
const DEFAULT_MODEL = "eleven_multilingual_v2";

const voice = () => process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE;
const model = () => process.env.ELEVENLABS_MODEL_ID || DEFAULT_MODEL;

export const ttsEnabled = () => Boolean(process.env.ELEVENLABS_API_KEY);

function audioKey(text: string): string {
  return createHash("sha256").update(`${model()}\n${voice()}\n${text}`).digest("hex");
}

/**
 * URL a client can play for `text`, or null when narration is off or there is nothing to read.
 * The `v` param changes with the text so browsers can cache each version forever.
 */
export function audioUrl(route: string, text: string): string | null {
  if (!ttsEnabled() || !text.trim()) return null;
  return `${route}${route.includes("?") ? "&" : "?"}v=${audioKey(text).slice(0, 16)}`;
}

const inflight = new Map<string, Promise<Buffer>>();

export async function speech(text: string): Promise<Buffer> {
  const key = audioKey(text);
  const dir = path.join(dataDir(), "tts");
  const file = path.join(dir, `${key}.mp3`);

  try {
    return await readFile(file);
  } catch {
    // not cached yet
  }

  // Several players hitting play at once on fresh text should share one synthesis.
  let pending = inflight.get(key);
  if (!pending) {
    pending = synthesize(text)
      .then(async (audio) => {
        await mkdir(dir, { recursive: true });
        const tmp = `${file}.${process.pid}.tmp`;
        await writeFile(tmp, audio);
        await rename(tmp, file);
        return audio;
      })
      .finally(() => inflight.delete(key));
    inflight.set(key, pending);
  }
  return pending;
}

/** Fire-and-forget synthesis so the first listener doesn't wait. */
export function warm(text: string): void {
  if (!ttsEnabled() || !text.trim()) return;
  speech(text).catch((e) => console.error("tts warm-up failed:", e));
}

async function synthesize(text: string): Promise<Buffer> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new HttpError(503, "error.ttsOff");

  const res = await fetch(
    `${API}/${encodeURIComponent(voice())}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "content-type": "application/json",
        accept: "audio/mpeg",
      },
      body: JSON.stringify({ text, model_id: model() }),
      signal: AbortSignal.timeout(120_000),
    },
  );
  if (!res.ok) {
    console.error("ElevenLabs error", res.status, await res.text().catch(() => ""));
    throw new HttpError(502, "error.ttsFailed");
  }
  return Buffer.from(await res.arrayBuffer());
}

/** Serve an mp3 with byte-range support — iOS Safari won't play <audio> without it. */
export function audioResponse(req: Request, audio: Buffer): Response {
  const total = audio.length;
  const headers: Record<string, string> = {
    "content-type": "audio/mpeg",
    "accept-ranges": "bytes",
    "cache-control": "private, max-age=31536000, immutable",
  };

  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
  if (m && (m[1] || m[2])) {
    let start: number;
    let end: number;
    if (m[1]) {
      start = Number(m[1]);
      end = m[2] ? Math.min(Number(m[2]), total - 1) : total - 1;
    } else {
      start = Math.max(0, total - Number(m[2]));
      end = total - 1;
    }
    if (start > end || start >= total) {
      return new Response(null, {
        status: 416,
        headers: { ...headers, "content-range": `bytes */${total}` },
      });
    }
    return new Response(new Uint8Array(audio.subarray(start, end + 1)), {
      status: 206,
      headers: {
        ...headers,
        "content-range": `bytes ${start}-${end}/${total}`,
        "content-length": String(end - start + 1),
      },
    });
  }

  return new Response(new Uint8Array(audio), {
    headers: { ...headers, "content-length": String(total) },
  });
}
