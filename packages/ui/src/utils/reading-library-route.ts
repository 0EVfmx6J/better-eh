export const librarySections = {
  history: '浏览历史',
  later: '稍后阅读',
}

export type LibrarySection = keyof typeof librarySections

export interface LibraryPage {
  kind: 'library'
  section: LibrarySection
  title: string
}

export function libraryUrl(home: string, section: LibrarySection): string {
  const url = new URL(home, location.href)
  url.hash = 'better-eh-' + section
  return url.href
}

export function libraryPage(url: string, home: string): LibraryPage | undefined {
  for (const section of ['history', 'later'] as const) {
    if (url === libraryUrl(home, section)) return { kind: 'library', section, title: librarySections[section] }
  }
}
