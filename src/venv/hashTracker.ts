import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';

const MARKER_FILENAME = '.requirements_hash';

/**
 * Computes the MD5 hash of a file's contents.
 * Compatible with the Python `hashlib.md5(f.read()).hexdigest()` format.
 */
export async function computeFileHash(filePath: string): Promise<string> {
  const content = await fs.readFile(filePath);
  return crypto.createHash('md5').update(content).digest('hex');
}

/**
 * Returns the path to the `.requirements_hash` marker file inside a venv directory.
 */
export function getMarkerPath(venvDir: string): string {
  return path.join(venvDir, MARKER_FILENAME);
}

/**
 * Reads the stored requirements hash from the marker file.
 * Returns null if the marker does not exist or cannot be read.
 */
export async function readStoredHash(venvDir: string): Promise<string | null> {
  try {
    const content = await fs.readFile(getMarkerPath(venvDir), 'utf-8');
    return content.trim();
  } catch {
    return null;
  }
}

/**
 * Writes a requirements hash to the marker file inside the venv directory.
 */
export async function writeHash(venvDir: string, hash: string): Promise<void> {
  await fs.writeFile(getMarkerPath(venvDir), hash, 'utf-8');
}

/**
 * Checks whether a venv is up to date by comparing the stored hash
 * against the current hash of the requirements file.
 *
 * Returns an object describing the state:
 * - `upToDate: true` — hashes match, no rebuild needed
 * - `upToDate: false` — hashes differ or marker missing
 * - `currentHash` — the hash of the requirements file on disk
 * - `storedHash` — the hash from the marker, or null
 */
export async function checkFreshness(
  venvDir: string,
  requirementsPath: string
): Promise<{ upToDate: boolean; currentHash: string; storedHash: string | null }> {
  let currentHash: string;
  try {
    currentHash = await computeFileHash(requirementsPath);
  } catch {
    // If requirements file doesn't exist, consider up to date (nothing to install)
    return { upToDate: true, currentHash: '', storedHash: null };
  }

  const storedHash = await readStoredHash(venvDir);

  return {
    upToDate: storedHash !== null && storedHash === currentHash,
    currentHash,
    storedHash,
  };
}
