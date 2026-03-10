// oauth.ts — OAuth login flow for WhatsApp interaction

import { AuthStorage } from "@mariozechner/pi-coding-agent";

// Re-define the callback types locally to avoid depending on pi-ai's export path.
// These match the OAuthLoginCallbacks interface from @mariozechner/pi-ai.
type OAuthAuthInfo = { url: string; instructions?: string };
type OAuthPrompt = { message: string; placeholder?: string; allowEmpty?: boolean };
interface OAuthLoginCallbacks {
  onAuth: (info: OAuthAuthInfo) => void;
  onPrompt: (prompt: OAuthPrompt) => Promise<string>;
  onProgress?: (message: string) => void;
  onManualCodeInput?: () => Promise<string>;
  signal?: AbortSignal;
}

// Default models to set after logging in with each provider
export const DEFAULT_MODELS: Record<string, { provider: string; modelId: string }> = {
  anthropic: { provider: "anthropic", modelId: "claude-sonnet-4-5" },
  "github-copilot": { provider: "github-copilot", modelId: "claude-sonnet-4-5" },
  "google-gemini-cli": { provider: "google-gemini-cli", modelId: "gemini-2.5-flash" },
  "google-antigravity": { provider: "google-antigravity", modelId: "gemini-2.5-flash" },
  "openai-codex": { provider: "openai-codex", modelId: "gpt-4o" },
};

// Pending input handlers per WhatsApp JID — allows the OAuth callbacks
// to "await" a reply from a specific user.
const pendingInputs = new Map<
  string,
  { resolve: (value: string) => void; reject: (reason: Error) => void }
>();

/**
 * Check if a jid has a pending input request (i.e. OAuth is waiting for user input).
 * If so, resolve it with the provided text and return true.
 */
export function resolveOAuthInput(jid: string, text: string): boolean {
  const pending = pendingInputs.get(jid);
  if (pending) {
    pending.resolve(text);
    pendingInputs.delete(jid);
    return true;
  }
  return false;
}

/**
 * Cancel any pending OAuth input for a jid.
 */
export function cancelOAuthInput(jid: string): void {
  const pending = pendingInputs.get(jid);
  if (pending) {
    pending.reject(new Error("Login cancelled"));
    pendingInputs.delete(jid);
  }
}

/**
 * List available OAuth providers for display.
 */
export function listProviders(authStorage: AuthStorage): string {
  const providers = authStorage.getOAuthProviders();
  if (providers.length === 0) return "No OAuth providers available.";

  const lines = providers.map(
    (p, i) => `${i + 1}. ${p.name} (${p.id})`
  );
  return [
    "Available login providers:",
    "",
    ...lines,
    "",
    "Reply with the number or provider name, e.g. /login 1",
  ].join("\n");
}

/**
 * Resolve a provider selection (number or name/id) to a provider ID.
 */
export function resolveProvider(
  authStorage: AuthStorage,
  input: string
): string | null {
  const providers = authStorage.getOAuthProviders();
  const trimmed = input.trim();

  // Try as number
  const num = parseInt(trimmed, 10);
  if (!isNaN(num) && num >= 1 && num <= providers.length) {
    return providers[num - 1].id;
  }

  // Try as id or partial name match
  const lower = trimmed.toLowerCase();
  const exact = providers.find(
    (p) => p.id === lower || p.name.toLowerCase() === lower
  );
  if (exact) return exact.id;

  const partial = providers.find(
    (p) =>
      p.id.includes(lower) ||
      p.name.toLowerCase().includes(lower)
  );
  if (partial) return partial.id;

  return null;
}

export interface LoginContext {
  sendMessage: (text: string) => Promise<void>;
  jid: string;
}

/**
 * Run the OAuth login flow for a given provider.
 * Sends messages to WhatsApp and awaits user replies for prompts.
 */
export async function performLogin(
  authStorage: AuthStorage,
  providerId: string,
  ctx: LoginContext
): Promise<void> {
  const callbacks: OAuthLoginCallbacks = {
    onAuth: (info) => {
      const parts = [info.url];
      if (info.instructions) parts.push(info.instructions);
      ctx.sendMessage(parts.join("\n\n"));
    },

    onPrompt: async (prompt) => {
      await ctx.sendMessage(prompt.message);

      // Wait for the user's next WhatsApp message
      return new Promise<string>((resolve, reject) => {
        pendingInputs.set(ctx.jid, { resolve, reject });

        // Timeout after 5 minutes
        setTimeout(() => {
          if (pendingInputs.has(ctx.jid)) {
            pendingInputs.delete(ctx.jid);
            reject(new Error("Login timed out waiting for input"));
          }
        }, 5 * 60 * 1000);
      });
    },

    onProgress: (message: string) => {
      ctx.sendMessage(message);
    },

    onManualCodeInput: async (): Promise<string> => {
      // For providers with callback servers, also offer manual paste
      return new Promise<string>((resolve, reject) => {
        // Only set if no prompt is already pending
        if (!pendingInputs.has(ctx.jid)) {
          pendingInputs.set(ctx.jid, { resolve, reject });

          setTimeout(() => {
            if (pendingInputs.has(ctx.jid)) {
              pendingInputs.delete(ctx.jid);
              reject(new Error("Login timed out"));
            }
          }, 5 * 60 * 1000);
        }
      });
    },
  };

  await authStorage.login(providerId, callbacks);
}
