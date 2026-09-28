export function isPracticeBadugiPath(pathname: string): boolean {
  const path = pathname.split(/[?#]/, 1)[0].replace(/\/+$/, "") || "/";
  return path === "/practice/badugi";
}

export function isPracticeBadugiRoute(): boolean {
  return typeof window !== "undefined" && isPracticeBadugiPath(window.location.pathname);
}