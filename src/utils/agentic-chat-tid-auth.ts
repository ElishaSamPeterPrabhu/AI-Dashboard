/**
 * Trimble ID OAuth (PKCE) for the Assist iframe embed — same flow as
 * modus-wc-2.0 `.storybook/addons/ai-chat/ChatPanel/auth.ts`.
 *
 * Register redirect URI `https://<your-app-origin>/tid-callback.html` for client
 * `61abccab-10ea-47bf-a616-b1b9c48bfa7b` in the Trimble developer console.
 */

const TOKEN_STORAGE_KEY = "agentic_chat_access_token";
const TOKEN_EXPIRY_KEY = "agentic_chat_token_expires_at";
const PKCE_VERIFIER_KEY = "agentic_chat_pkce_verifier";
const OAUTH_STATE_KEY = "agentic_chat_oauth_state";

const TID_AUTH_URL = "https://id.trimble.com";
const TID_CLIENT_ID = "61abccab-10ea-47bf-a616-b1b9c48bfa7b";
const TID_SCOPES = "openid agents";

function getCallbackUrl(): string {
  return `${window.location.origin}/tid-callback.html`;
}

function base64UrlEncode(array: Uint8Array): string {
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

async function generatePKCEPair() {
  const verifierBytes = new Uint8Array(32);
  crypto.getRandomValues(verifierBytes);
  const codeVerifier = base64UrlEncode(verifierBytes);
  const challengeBuffer = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(codeVerifier)
  );
  const codeChallenge = base64UrlEncode(new Uint8Array(challengeBuffer));
  return { codeVerifier, codeChallenge };
}

export function getStoredAgenticChatToken(): string | null {
  const token = sessionStorage.getItem(TOKEN_STORAGE_KEY);
  const expiresAtRaw = sessionStorage.getItem(TOKEN_EXPIRY_KEY);
  if (!token || !expiresAtRaw) return null;
  const expiresAt = parseInt(expiresAtRaw, 10);
  if (Number.isNaN(expiresAt) || Date.now() >= expiresAt - 60_000) return null;
  return token;
}

export function clearAgenticChatToken(): void {
  sessionStorage.removeItem(TOKEN_STORAGE_KEY);
  sessionStorage.removeItem(TOKEN_EXPIRY_KEY);
}

export async function openTrimbleIdLoginPopup(): Promise<string> {
  const { codeVerifier, codeChallenge } = await generatePKCEPair();
  sessionStorage.setItem(PKCE_VERIFIER_KEY, codeVerifier);

  const redirectUri = getCallbackUrl();
  const state = base64UrlEncode(crypto.getRandomValues(new Uint8Array(16)));
  sessionStorage.setItem(OAUTH_STATE_KEY, state);

  const authUrl = new URL(`${TID_AUTH_URL}/oauth/authorize`);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", TID_CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("scope", TID_SCOPES);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  return new Promise((resolve, reject) => {
    const popup = window.open(
      authUrl.toString(),
      "TID Login",
      "width=500,height=700,left=200,top=100"
    );

    if (!popup) {
      sessionStorage.removeItem(PKCE_VERIFIER_KEY);
      sessionStorage.removeItem(OAUTH_STATE_KEY);
      reject(new Error("Popup blocked. Please allow popups for this site."));
      return;
    }

    const handleMessage = async (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== "tid-callback") return;
      if (event.source !== popup) return;
      window.removeEventListener("message", handleMessage);
      clearInterval(pollTimer);
      popup.close();

      const { code, state: returnedState, error } = event.data;
      const expectedState = sessionStorage.getItem(OAUTH_STATE_KEY);
      sessionStorage.removeItem(OAUTH_STATE_KEY);

      if (returnedState !== expectedState) {
        sessionStorage.removeItem(PKCE_VERIFIER_KEY);
        reject(new Error("State mismatch – possible CSRF attack"));
        return;
      }

      if (error || !code) {
        sessionStorage.removeItem(PKCE_VERIFIER_KEY);
        reject(new Error(error || "No authorization code received"));
        return;
      }

      try {
        const storedVerifier = sessionStorage.getItem(PKCE_VERIFIER_KEY);
        if (!storedVerifier) throw new Error("PKCE verifier not found");

        const tokenResponse = await fetch(`${TID_AUTH_URL}/oauth/token`, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Accept: "application/json",
          },
          body: new URLSearchParams({
            grant_type: "authorization_code",
            client_id: TID_CLIENT_ID,
            code,
            redirect_uri: redirectUri,
            code_verifier: storedVerifier,
          }),
        });

        const tokenData = (await tokenResponse.json()) as {
          access_token?: string;
          expires_in?: number;
          error?: string;
          error_description?: string;
        };
        sessionStorage.removeItem(PKCE_VERIFIER_KEY);

        if (tokenData.access_token) {
          const expiresIn =
            typeof tokenData.expires_in === "number" ? tokenData.expires_in : 3600;
          const expiresAt = Date.now() + expiresIn * 1000;
          sessionStorage.setItem(TOKEN_STORAGE_KEY, tokenData.access_token);
          sessionStorage.setItem(TOKEN_EXPIRY_KEY, expiresAt.toString());
          resolve(tokenData.access_token);
        } else {
          reject(
            new Error(
              tokenData.error_description ||
                tokenData.error ||
                "Token exchange failed"
            )
          );
        }
      } catch (err) {
        sessionStorage.removeItem(PKCE_VERIFIER_KEY);
        reject(err);
      }
    };

    window.addEventListener("message", handleMessage);

    const pollTimer = setInterval(() => {
      if (popup.closed) {
        clearInterval(pollTimer);
        window.removeEventListener("message", handleMessage);
        sessionStorage.removeItem(PKCE_VERIFIER_KEY);
        sessionStorage.removeItem(OAUTH_STATE_KEY);
        reject(new Error("Login popup was closed"));
      }
    }, 500);
  });
}
