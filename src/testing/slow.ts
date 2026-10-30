/** Time limit for a long simulation test: GitHub's small build machine runs several test files at once and is
 * several times slower than a laptop, so limits stretch there (CI is set by GitHub Actions). */
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env;
export const CI_SLOWDOWN = env?.CI ? 4 : 1;
export const slow = (ms: number) => ms * CI_SLOWDOWN;
