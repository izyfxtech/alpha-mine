/** Longest storage path accepted, in characters. Real paths are `<user id>/<owner id>/<uuid>-<file name>`, under 200. */
const MAX_PATH = 400;

/** True for a clean relative path: no empty, `.` or `..` segments, so it cannot climb out of its folder. */
export function isCleanPath(path: string): boolean {
  return (
    path.length > 0 &&
    path.length <= MAX_PATH &&
    !path.startsWith("/") &&
    path.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..")
  );
}

/** Every user's files live under their own folder, named by their user id. */
export function isOwnPath(userId: string, path: string): boolean {
  return isCleanPath(path) && path.startsWith(`${userId}/`);
}
