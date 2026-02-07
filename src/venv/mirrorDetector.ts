import * as vscode from 'vscode';
import * as https from 'https';

const GEOIP_ENDPOINTS = [
  'https://ipapi.co/country/',
  'https://ifconfig.co/country-iso',
];

export interface MirrorInfo {
  url: string;
  name: string;
}

interface MirrorRule {
  name: string;
  url: string;
  countries: Set<string>;
}

const TSINGHUA_PYPI = 'https://pypi.tuna.tsinghua.edu.cn/simple';

const MIRROR_RULES: MirrorRule[] = [
  {
    name: 'Tsinghua (CN)',
    url: TSINGHUA_PYPI,
    countries: new Set(['CN']),
  },
  {
    name: 'NUS (SE Asia)',
    url: 'https://mirror.nus.edu.sg/pypi/simple',
    countries: new Set(['SG', 'MY', 'ID', 'PH', 'VN', 'TH', 'KH', 'LA', 'MM', 'BN']),
  },
  {
    name: 'Fau (EU)',
    url: 'https://ftp.fau.de/python/pypi/simple',
    countries: new Set([
      'DE', 'FR', 'NL', 'BE', 'CH', 'AT', 'PL', 'CZ', 'HU', 'IT',
      'ES', 'PT', 'SE', 'NO', 'DK', 'FI', 'GB', 'UK', 'IE',
    ]),
  },
];

/** Cached result so we only do the geolocation once per session. */
let cachedMirror: MirrorInfo | null | undefined; // undefined = not yet checked

/**
 * Detects the best PyPI mirror based on the user's geolocation.
 *
 * Resolution order:
 * 1. Extension setting `jupyterKernelManager.pypiMirror` (if not "auto")
 * 2. Cached result from a previous call this session
 * 3. GeoIP lookup → mirror rule matching
 * 4. null (use default PyPI)
 */
export async function getPreferredMirror(): Promise<MirrorInfo | null> {
  // 1. Check explicit setting
  const setting = vscode.workspace.getConfiguration('jupyterKernelManager').get<string>('pypiMirror', 'auto');
  if (setting && setting !== 'auto') {
    return { url: setting, name: 'User setting' };
  }

  // 2. Return cached result if we've already looked up this session
  if (cachedMirror !== undefined) {
    return cachedMirror;
  }

  // 3. GeoIP lookup
  const countryCode = await detectCountryCode();
  cachedMirror = resolveMirrorForCountry(countryCode);
  return cachedMirror;
}

/**
 * Returns pip args for using the detected mirror (e.g. ["-i", "https://..."]).
 * Returns an empty array if no mirror is selected (use default PyPI).
 */
export async function getMirrorArgs(): Promise<string[]> {
  const mirror = await getPreferredMirror();
  if (mirror) {
    return ['-i', mirror.url];
  }
  return [];
}

/**
 * Clears the cached mirror result (useful for testing or when settings change).
 */
export function clearMirrorCache(): void {
  cachedMirror = undefined;
}

// ----- Internal helpers -----

function resolveMirrorForCountry(countryCode: string | null): MirrorInfo | null {
  if (!countryCode) {
    return null;
  }
  for (const rule of MIRROR_RULES) {
    if (rule.countries.has(countryCode)) {
      return { url: rule.url, name: rule.name };
    }
  }
  return null;
}

async function detectCountryCode(): Promise<string | null> {
  for (const endpoint of GEOIP_ENDPOINTS) {
    try {
      const code = await httpGet(endpoint, 2000);
      const trimmed = code.trim().toUpperCase();
      if (trimmed.length === 2) {
        return trimmed;
      }
    } catch {
      // Try next endpoint
    }
  }
  return null;
}

function httpGet(url: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: timeoutMs }, (res) => {
      let data = '';
      res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });
  });
}
