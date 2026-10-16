import { PageDocumentSchema, type PageDocument, type PageName } from '@shared/pages'

export class StalePageError extends Error {
  constructor(public currentPage: PageDocument) { super('This page changed in another window. The newer page is shown here.') }
}

export async function requestPage(projectId: string, name: PageName, page?: PageDocument): Promise<PageDocument> {
  const bootstrap = await fetch('/api/project-library/bootstrap', { credentials: 'same-origin' })
  const { sessionToken } = await bootstrap.json()
  const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/pages/${name}`, {
    method: page ? 'PUT' : 'GET', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'X-WriterOS-Session': sessionToken },
    ...(page ? { body: JSON.stringify({ expectedRevision: page.revision, page }) } : {}),
  })
  const body = await response.json()
  if (response.status === 409) throw new StalePageError(PageDocumentSchema.parse(body.currentPage))
  if (!response.ok) throw new Error(body.message || 'Could not load or save this page. Try again.')
  return PageDocumentSchema.parse(body.page)
}
