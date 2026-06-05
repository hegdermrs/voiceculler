// Google Identity Services (GIS) implicit token flow.
// The access token is kept only in memory for the session.

const SCOPE = "https://www.googleapis.com/auth/drive";

let tokenClient: google.accounts.oauth2.TokenClient | null = null;
let accessToken: string | null = null;
let tokenExpiry = 0;

export function isConfigured(): boolean {
  return Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID);
}

function waitForGis(): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      if (window.google?.accounts?.oauth2) {
        resolve();
      } else if (Date.now() - start > 10000) {
        reject(new Error("Google Identity Services failed to load."));
      } else {
        setTimeout(check, 100);
      }
    };
    check();
  });
}

async function ensureTokenClient(): Promise<google.accounts.oauth2.TokenClient> {
  if (tokenClient) return tokenClient;
  await waitForGis();
  tokenClient = window.google!.accounts.oauth2.initTokenClient({
    client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
    scope: SCOPE,
    callback: () => {
      // Replaced per-request below.
    },
  });
  return tokenClient;
}

/** Prompts the user to sign in and authorize Drive access. Resolves with the token. */
export async function signIn(): Promise<string> {
  const client = await ensureTokenClient();
  return new Promise((resolve, reject) => {
    client.callback = (resp) => {
      if (resp.error) {
        reject(new Error(resp.error));
        return;
      }
      accessToken = resp.access_token;
      tokenExpiry = Date.now() + (resp.expires_in - 60) * 1000;
      resolve(accessToken);
    };
    client.requestAccessToken({ prompt: accessToken ? "" : "consent" });
  });
}

/** Returns a valid token, silently refreshing if it is near expiry. */
export async function getAccessToken(): Promise<string> {
  if (accessToken && Date.now() < tokenExpiry) return accessToken;
  return signIn();
}

export function signOut(): void {
  if (accessToken && window.google?.accounts?.oauth2) {
    window.google.accounts.oauth2.revoke(accessToken);
  }
  accessToken = null;
  tokenExpiry = 0;
}

export function isSignedIn(): boolean {
  return Boolean(accessToken) && Date.now() < tokenExpiry;
}
