/**
 * Git Bash (MSYS) rewrites an argument like `/lesson/x` into a Windows path such as
 * `C:/Program Files/Git/lesson/x`, so a script would silently screenshot the home page.
 * Spot that and recover the app route when it's still recognisable.
 */
export function recoverRoute(route) {
  if (!/^[A-Za-z]:[\\/]/.test(route)) return { route, rewritten: false };
  const posix = route.replace(/\\/g, '/');
  const at = posix.indexOf('/lesson/');
  return { route: at >= 0 ? posix.slice(at) : '/', rewritten: true };
}
