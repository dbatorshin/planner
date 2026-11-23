/**
 * Biometrics / WebAuthn utility for Face ID, Touch ID, Android Biometrics, and Windows Hello
 */

const BIOMETRIC_ENABLED_KEY = 'planner_biometrics_enabled';
const BIOMETRIC_CRED_ID_KEY = 'planner_biometrics_cred_id';
const BIOMETRIC_DISMISSED_KEY = 'planner_biometrics_dismissed';

export function isWebAuthnSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(
    window.isSecureContext &&
    window.PublicKeyCredential &&
    navigator.credentials
  );
}

export async function isPlatformAuthenticatorAvailable(): Promise<boolean> {
  if (!isWebAuthnSupported()) return false;
  try {
    if (typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function') {
      return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    }
  } catch {
    return false;
  }
  return false;
}

export function isBiometricsEnabled(): boolean {
  try {
    return localStorage.getItem(BIOMETRIC_ENABLED_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setBiometricsEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(BIOMETRIC_ENABLED_KEY, enabled ? 'true' : 'false');
    if (enabled) {
      localStorage.removeItem(BIOMETRIC_DISMISSED_KEY);
    }
  } catch {}
}

export function hasBiometricsCredential(): boolean {
  try {
    return Boolean(localStorage.getItem(BIOMETRIC_CRED_ID_KEY));
  } catch {
    return false;
  }
}

export function isBiometricsConfigured(): boolean {
  return isBiometricsEnabled() && hasBiometricsCredential();
}

export function isBiometricsDismissed(): boolean {
  try {
    return localStorage.getItem(BIOMETRIC_DISMISSED_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setBiometricsDismissed(dismissed: boolean): void {
  try {
    if (dismissed) {
      localStorage.setItem(BIOMETRIC_DISMISSED_KEY, 'true');
    } else {
      localStorage.removeItem(BIOMETRIC_DISMISSED_KEY);
    }
  } catch {}
}

export function clearBiometrics(): void {
  try {
    localStorage.removeItem(BIOMETRIC_ENABLED_KEY);
    localStorage.removeItem(BIOMETRIC_CRED_ID_KEY);
    localStorage.removeItem(BIOMETRIC_DISMISSED_KEY);
  } catch {}
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function getRpId(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  const host = window.location.hostname;
  if (!host) return undefined;
  // If IP address, omit rpId to adhere to WebAuthn spec
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(host)) {
    return undefined;
  }
  return host;
}

/**
 * Register hardware platform authenticator (Face ID / Touch ID / Windows Hello)
 */
export async function registerBiometrics(): Promise<{ success: boolean; error?: string }> {
  if (!isWebAuthnSupported()) {
    return { success: false, error: 'Биометрия не поддерживается данным браузером' };
  }

  const isAvailable = await isPlatformAuthenticatorAvailable();
  if (!isAvailable) {
    return { success: false, error: 'Датчик биометрии не обнаружен на устройстве' };
  }

  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const userId = crypto.getRandomValues(new Uint8Array(16));

    const rp: PublicKeyCredentialRpEntity = {
      name: 'Планер',
    };
    const rpId = getRpId();
    if (rpId) {
      rp.id = rpId;
    }

    const creationOptions: CredentialCreationOptions = {
      publicKey: {
        challenge,
        rp,
        user: {
          id: userId,
          name: 'Планер',
          displayName: 'Планер',
        },
        pubKeyCredParams: [
          { alg: -7, type: 'public-key' },   // ES256 (iOS / Android)
          { alg: -257, type: 'public-key' }, // RS256 (Windows Hello)
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          residentKey: 'preferred',
        },
        timeout: 60000,
      },
    };

    const credential = (await navigator.credentials.create(creationOptions)) as PublicKeyCredential | null;

    if (!credential || !credential.rawId) {
      return { success: false, error: 'Не удалось завершить регистрацию' };
    }

    const credIdBase64 = arrayBufferToBase64(credential.rawId);
    localStorage.setItem(BIOMETRIC_CRED_ID_KEY, credIdBase64);
    localStorage.setItem(BIOMETRIC_ENABLED_KEY, 'true');
    localStorage.removeItem(BIOMETRIC_DISMISSED_KEY);

    return { success: true };
  } catch (err: any) {
    console.warn('WebAuthn register error:', err);
    if (err?.name === 'NotAllowedError') {
      return { success: false, error: 'Сканирование лица или отпечатка отменено' };
    }
    return { success: false, error: err?.message || 'Ошибка привязки биометрии' };
  }
}

/**
 * Verify identity via hardware biometric sensor
 */
export async function verifyBiometrics(): Promise<{ success: boolean; error?: string }> {
  if (!isWebAuthnSupported()) {
    return { success: false, error: 'Биометрия не поддерживается' };
  }

  const credIdBase64 = localStorage.getItem(BIOMETRIC_CRED_ID_KEY);
  const challenge = crypto.getRandomValues(new Uint8Array(32));

  const publicKeyOptions: PublicKeyCredentialRequestOptions = {
    challenge,
    userVerification: 'required',
    timeout: 60000,
  };

  const rpId = getRpId();
  if (rpId) {
    publicKeyOptions.rpId = rpId;
  }

  if (credIdBase64) {
    try {
      publicKeyOptions.allowCredentials = [
        {
          id: base64ToArrayBuffer(credIdBase64),
          type: 'public-key',
        },
      ];
    } catch (e) {
      console.warn('Invalid credId buffer:', e);
    }
  }

  try {
    const assertion = await navigator.credentials.get({
      publicKey: publicKeyOptions,
    });

    if (assertion) {
      return { success: true };
    }
    return { success: false, error: 'Личность не подтверждена' };
  } catch (err: any) {
    console.warn('WebAuthn verify error:', err);
    if (err?.name === 'NotAllowedError') {
      return { success: false, error: 'Сканирование лица или отпечатка отменено' };
    }
    return { success: false, error: err?.message || 'Ошибка верификации биометрии' };
  }
}
