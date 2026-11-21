const lockStyles = `
  html { overscroll-behavior-y: none !important; }
  html, body {
    overflow: hidden !important;
    margin: 0 !important;
    padding: 0 !important;
    width: auto !important;
    min-width: 0 !important;
    max-width: none !important;
  }
`

export function createDocumentLock(interfaceIds: ReadonlySet<string>) {
  const style = document.createElement('style')
  style.textContent = lockStyles
  const originalViewport = document.querySelector<HTMLMetaElement>('meta[name="viewport"]')
  const originalContent = originalViewport?.getAttribute('content')
  const viewport = originalViewport ?? document.createElement('meta')
  const disabled = new Set<Element>()
  let previousScroll: [number, number] | undefined

  function disableOriginal(): void {
    for (const element of document.body.children) {
      if (interfaceIds.has(element.id) || element.hasAttribute('inert')) continue
      element.setAttribute('inert', '')
      disabled.add(element)
    }
  }

  function set(locked: boolean, framed = false): void {
    if (locked || framed) disableOriginal()
    else {
      for (const element of disabled) element.removeAttribute('inert')
      disabled.clear()
    }
    if (locked || framed) {
      if (!style.isConnected) {
        previousScroll = [window.scrollX, window.scrollY]
        document.head.append(style)
      }
      viewport.name = 'viewport'
      viewport.content = 'width=device-width, initial-scale=1, viewport-fit=cover'
      if (!viewport.isConnected) document.head.append(viewport)
    } else {
      style.remove()
      if (!originalViewport) viewport.remove()
      else if (originalContent === null || originalContent === undefined) viewport.removeAttribute('content')
      else viewport.content = originalContent
      if (previousScroll) window.scrollTo(...previousScroll)
      previousScroll = undefined
    }
  }

  return { set }
}

export function createNativeFrame(id: string) {
  let frame: HTMLIFrameElement | undefined

  function current() {
    try {
      const doc = frame?.contentDocument
      if (!doc || doc.URL === 'about:blank') return undefined
      return { doc, url: new URL(doc.URL) }
    } catch {
      return undefined
    }
  }

  function setVisible(visible: boolean): void {
    if (!frame) return
    frame.style.visibility = visible ? 'visible' : 'hidden'
    frame.inert = !visible
  }

  async function load(url: URL): Promise<boolean> {
    if (current()?.url.href === url.href) return true
    frame?.remove()
    const next = document.createElement('iframe')
    next.id = id
    next.title = '原站页面'
    next.style.cssText =
      'position:fixed;inset:0;z-index:2147483645;width:100%;height:100%;border:0;background:white;visibility:hidden'
    next.inert = true
    frame = next
    const loaded = await new Promise<boolean>((resolve) => {
      const timer = window.setTimeout(() => finish(false), 8000)
      function finish(success: boolean): void {
        clearTimeout(timer)
        next.removeEventListener('load', onLoad)
        resolve(success)
      }
      function onLoad(): void {
        const loaded = current()
        finish(Boolean(loaded))
      }
      document.body.append(next)
      // Replace the blank frame entry so opening the original does not add a Back step.
      next.contentWindow?.location.replace(url.href)
      next.addEventListener('load', onLoad)
    })
    if (!loaded) {
      next.remove()
      if (frame === next) frame = undefined
    }
    return loaded
  }

  return { current, setVisible, load }
}
