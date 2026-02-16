import { JWT } from "google-auth-library";
import { readFileSync } from "fs";

const GOOGLE_SCOPE = "https://www.googleapis.com/auth/cloud-platform";

type ServiceAccount = {
  client_email?: string;
  private_key?: string;
};

const parseServiceAccount = (): ServiceAccount | null => {
  const raw = process.env.GOOGLE_TTS_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;

  const normalize = (input: string) => {
    const trimmed = input.trim();
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;

    // Support base64-encoded JSON.
    try {
      const decoded = Buffer.from(trimmed, "base64").toString("utf8").trim();
      if (decoded.startsWith("{") && decoded.endsWith("}")) return decoded;
    } catch {}

    // Support file path to JSON.
    if (trimmed.endsWith(".json")) {
      try {
        return readFileSync(trimmed, "utf8").trim();
      } catch (error) {
        console.error("Failed to read service account file", error);
      }
    }

    return trimmed;
  };

  try {
    const normalized = normalize(raw);
    const parsed = JSON.parse(normalized) as ServiceAccount;
    if (parsed.private_key) {
      parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
    }
    return parsed;
  } catch (error) {
    console.error("Failed to parse GOOGLE_TTS_SERVICE_ACCOUNT_JSON", error);
    return null;
  }
};

export async function getGoogleTtsAccessToken(): Promise<string | null> {
  const serviceAccount = parseServiceAccount();
  if (!serviceAccount?.client_email || !serviceAccount.private_key) return null;

  try {
    const client = new JWT({
      email: serviceAccount.client_email,
      key: serviceAccount.private_key,
      scopes: [GOOGLE_SCOPE],
    });

    const token = await client.getAccessToken();
    return token?.token || null;
  } catch (error) {
    console.error("Failed to obtain Google access token", error);
    return null;
  }
}

export function getGoogleTtsApiKey(): string | null {
  return process.env.GOOGLE_TTS_API_KEY || null;
}
