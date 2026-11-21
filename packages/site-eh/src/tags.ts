import type { ManagedTag, SiteDocument, TagChange, TagsPage } from '@better-eh/core'

interface TagSource {
  url: URL
  hiddenFields: [string, string][]
  api?: { url: string; userId: number; key: string }
}

function tagsUrl(base: URL, group: string): URL {
  const url = new URL('/mytags', base)
  if (group !== '1') url.searchParams.set('tagset', group)
  return url
}

function readApi(doc: SiteDocument, url: URL): TagSource['api'] {
  if (url.hostname !== 'e-hentai.org' && url.hostname !== 'exhentai.org') return undefined
  const host = url.hostname === 'exhentai.org' ? 's.exhentai.org' : 'api.e-hentai.org'
  for (const script of doc.querySelectorAll('script:not([src])')) {
    const code = script.textContent ?? ''
    const userId = Number(code.match(/\bapiuid\s*=\s*(\d+)/)?.[1])
    const key = code.match(/\bapikey\s*=\s*["']([a-z0-9_-]+)["']/i)?.[1]
    if (userId > 0 && key) return { url: 'https://' + host + '/api.php', userId, key }
  }
}

function readTag(row: HTMLElement): ManagedTag | undefined {
  const id = row.id.match(/^usertag_([1-9]\d*)$/)?.[1]
  if (!id) return undefined
  const preview = row.querySelector('[id^="tagpreview_"]')
  const name = preview?.getAttribute('title')?.trim() || row.querySelector('a[href*="/tag/"]')?.textContent?.trim()
  if (!name) return undefined
  const input = (prefix: string) => row.querySelector<HTMLInputElement>('input[id^="' + prefix + '_"]')
  const weight = Number(input('tagweight')?.value ?? 10)
  return {
    id,
    name,
    watched: input('tagwatch')?.checked ?? false,
    hidden: input('taghide')?.checked ?? false,
    weight: Number.isFinite(weight) ? weight : 10,
    color: input('tagcolor')?.value.trim() ?? '',
  }
}

function buildTagsPage(data: Omit<TagsPage, 'submit'>, source: TagSource): TagsPage {
  return {
    ...data,
    async submit(change) {
      if (change.kind === 'edit') {
        if (!source.api || !data.tags.some((tag) => tag.id === change.id)) throw new Error('请在原站编辑此标签。')
        await saveTag(source.api, change)
        const { kind: _kind, ...preferences } = change
        return buildTagsPage(
          {
            ...data,
            tags: data.tags.map((tag) => (tag.id === change.id ? { ...tag, ...preferences } : tag)),
          },
          source,
        )
      }
      return submitTagForm(data, source, change)
    },
  }
}

async function saveTag(
  api: NonNullable<TagSource['api']>,
  change: Extract<TagChange, { kind: 'edit' }>,
): Promise<void> {
  const response = await fetch(api.url, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      method: 'setusertag',
      apiuid: api.userId,
      apikey: api.key,
      tagid: Number(change.id),
      tagwatch: Number(change.watched),
      taghide: Number(change.hidden),
      tagcolor: change.color,
      tagweight: String(change.weight),
    }),
  })
  if (!response.ok) throw new Error('保存标签失败（HTTP ' + response.status + '）。')
  const result: unknown = await response.json()
  if (!result || typeof result !== 'object') throw new Error('原站未确认保存。')
  if ('login' in result && result.login) throw new Error('请先在原站登录。')
  if ('error' in result && typeof result.error === 'string' && result.error) throw new Error(result.error)
  if (!('tagid' in result) || Number(result.tagid) !== Number(change.id)) throw new Error('原站未确认保存。')
}

async function submitTagForm(
  page: Omit<TagsPage, 'submit'>,
  source: TagSource,
  change: Exclude<TagChange, { kind: 'edit' }>,
): Promise<TagsPage> {
  const body = new URLSearchParams(source.hiddenFields)
  body.set('tagname_new', '')
  body.set('tagcolor_new', '')
  body.set('tagweight_new', '10')
  if (change.kind === 'add') {
    if (!page.canAdd) throw new Error('此标签组无法添加标签。')
    body.set('usertag_action', 'add')
    body.set('tagname_new', change.name)
    body.set('tagcolor_new', change.color)
    body.set('tagweight_new', String(change.weight))
    if (change.watched) body.set('tagwatch_new', 'on')
    if (change.hidden) body.set('taghide_new', 'on')
  } else {
    if (!change.ids.length || change.ids.some((id) => !page.tags.some((tag) => tag.id === id))) {
      throw new Error('请重新选择要操作的标签。')
    }
    const target = change.kind === 'move' ? change.target : '0'
    if (change.kind === 'move' && !page.groups.some((group) => group.id === target && group.id !== page.activeGroup)) {
      throw new Error('请选择其他标签组。')
    }
    body.set('usertag_action', 'mass')
    body.set('usertag_target', target)
    for (const id of change.ids) body.append('modify_usertags[]', id)
  }

  const response = await fetch(source.url, { method: 'POST', credentials: 'same-origin', body })
  if (!response.ok) throw new Error('标签操作失败（HTTP ' + response.status + '）。')
  const url = new URL(response.url || source.url.href)
  const template = document.createElement('template')
  template.innerHTML = await response.text()
  const updated = url.origin === source.url.origin && parseTags(template.content, url)
  if (!updated || updated.activeGroup !== page.activeGroup) throw new Error('无法确认操作结果，请在原站检查。')
  if (change.kind === 'add') {
    const name = change.name.trim().toLowerCase()
    const matchingTag = updated.tags.some((tag) => tag.name.toLowerCase() === name)
    const addedTag = updated.tags.some((tag) => !page.tags.some((saved) => saved.id === tag.id))
    if (!matchingTag && !addedTag) throw new Error('原站未添加此标签，请检查标签名称。')
  } else if (updated.tags.some((tag) => change.ids.includes(tag.id))) {
    throw new Error('部分标签仍在原分组，请检查后重试。')
  }
  return updated
}

export function parseTags(doc: SiteDocument, url: URL): TagsPage | undefined {
  if (url.pathname.replace(/\/$/, '') !== '/mytags') return undefined
  const form = doc.querySelector('#usertag_form')
  const tagList = doc.querySelector('#usertags_outer')
  if (!form || !tagList) return undefined

  const select = doc.querySelector<HTMLSelectElement>('#tagset_outer select')
  const activeGroup = select?.value || url.searchParams.get('tagset') || '1'
  const groups = Array.from(select?.options ?? [], (option) => ({
    id: option.value,
    label: (option.textContent ?? '').trim() || option.value,
    href: tagsUrl(url, option.value).href,
  }))
  const tags = Array.from(tagList.querySelectorAll<HTMLElement>(':scope > [id^="usertag_"]')).flatMap(
    (row) => readTag(row) ?? [],
  )
  const api = readApi(doc, url)
  const hiddenFields = Array.from(form.querySelectorAll<HTMLInputElement>('input[type="hidden"][name]:enabled'))
    .filter((input) => !['usertag_action', 'usertag_target', 'modify_usertags[]'].includes(input.name))
    .map<[string, string]>((input) => [input.name, input.value])
  return buildTagsPage(
    {
      kind: 'tags',
      title: '我的标签',
      groups,
      activeGroup,
      groupEnabled: doc.querySelector<HTMLInputElement>('#tagset_enable')?.checked ?? true,
      defaultColor: doc.querySelector<HTMLInputElement>('#tagcolor')?.value.trim() ?? '',
      tags,
      canAdd: Boolean(form.querySelector('#tagname_new:enabled')),
      canEdit: Boolean(api),
    },
    { url: tagsUrl(url, activeGroup), hiddenFields, api },
  )
}
