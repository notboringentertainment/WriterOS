import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FdxImportError, importFdxFile, importFdxXml, titleFromFdxFilename } from '../../client/src/lib/fdxImport'

function readFixture(name: string): string {
  return readFileSync(resolve(process.cwd(), 'tests/fixtures/fdx', name), 'utf8')
}

function expectedHtml(name: string): string {
  return readFixture(name).replace(/^<!--[\s\S]*?-->\s*/, '').trim()
}

describe('Final Draft .fdx import', () => {
  it('converts the context-preservation fixture into WriterOS script HTML', () => {
    const imported = importFdxXml(readFixture('context-preservation.fdx'), {
      filename: 'context-preservation.fdx',
      importedAt: Date.parse('2026-05-24T00:00:00.000Z'),
    })

    expect(imported.rawHtml).toBe(expectedHtml('context-preservation.expected.html'))
    expect(imported.scenes).toEqual([
      expect.objectContaining({ heading: 'INT. PALACE ATRIUM - NIGHT', index: 1 }),
      expect.objectContaining({ heading: 'EXT. OLD CITY CHECKPOINT - DAWN', index: 2 }),
    ])
    expect(imported.wordCount).toBeGreaterThan(0)
    expect(imported.pageCount).toBe(1)
    expect(imported.sourceImport).toMatchObject({
      kind: 'fdx',
      originalFilename: 'context-preservation.fdx',
      importedAt: '2026-05-24T00:00:00.000Z',
    })
    expect(imported.sourceImport.rawSource).toContain('<FinalDraft')
    expect(imported.warnings).toContain('Unknown Final Draft paragraph type "New Act" imported as Action.')
  })

  it('preserves title-page titles, XML entities, unicode, and multiple Text nodes', () => {
    const imported = importFdxXml(`
      <?xml version="1.0" encoding="UTF-8"?>
      <FinalDraft DocumentType="Script" Template="No" Version="5">
        <TitlePage>
          <Content>
            <Paragraph Type="Title">
              <Text>El Niño &amp; The Moon</Text>
            </Paragraph>
          </Content>
        </TitlePage>
        <Content>
          <Paragraph Type="Scene Heading"><Text>INT. CAFÉ - NIGHT</Text></Paragraph>
          <Paragraph Type="Action"><Text>Rain taps </Text><Text>against glass &amp; neon.</Text></Paragraph>
        </Content>
      </FinalDraft>
    `)

    expect(imported.title).toBe('El Niño & The Moon')
    expect(imported.rawHtml).toContain('INT. CAFÉ - NIGHT')
    expect(imported.rawHtml).toContain('Rain taps against glass &amp; neon.')
  })

  it('falls back to filename when the title page only has credit text', () => {
    const imported = importFdxXml(`
      <?xml version="1.0" encoding="UTF-8"?>
      <FinalDraft DocumentType="Script" Template="No" Version="5">
        <TitlePage>
          <Content>
            <Paragraph Type="Title"><Text></Text></Paragraph>
            <Paragraph><Text>by</Text></Paragraph>
            <Paragraph><Text>Jane Writer</Text></Paragraph>
          </Content>
        </TitlePage>
        <Content>
          <Paragraph Type="Scene Heading"><Text>INT. ROOM - DAY</Text></Paragraph>
        </Content>
      </FinalDraft>
    `, { filename: 'Real Title.fdx' })

    expect(imported.title).toBe('Real Title')
  })

  it('imports nested Content paragraphs in document order and dedupes repeated warnings', () => {
    const imported = importFdxXml(`
      <?xml version="1.0" encoding="UTF-8"?>
      <FinalDraft DocumentType="Script" Template="No" Version="5">
        <Content>
          <Paragraph Type="Scene Heading"><Text>INT. ROOM - DAY</Text></Paragraph>
          <ActBreak>
            <Paragraph Type="New Act"><Text>Act two begins.</Text></Paragraph>
            <Paragraph Type="New Act"><Text>The pressure rises.</Text></Paragraph>
          </ActBreak>
          <Paragraph Type="Dialogue"><Text>We keep moving.</Text></Paragraph>
        </Content>
      </FinalDraft>
    `)

    expect(imported.rawHtml).toContain('Act two begins.')
    expect(imported.rawHtml).toContain('The pressure rises.')
    expect(imported.rawHtml.indexOf('Act two begins.')).toBeLessThan(imported.rawHtml.indexOf('The pressure rises.'))
    expect(imported.rawHtml.indexOf('The pressure rises.')).toBeLessThan(imported.rawHtml.indexOf('We keep moving.'))
    expect(imported.warnings).toEqual([
      'Unknown Final Draft paragraph type "New Act" imported as Action.',
    ])
  })

  it('drops blank Final Draft paragraphs instead of importing extra spacing blocks', () => {
    const imported = importFdxXml(`
      <?xml version="1.0" encoding="UTF-8"?>
      <FinalDraft DocumentType="Script" Template="No" Version="5">
        <Content>
          <Paragraph Type="Scene Heading"><Text>INT. BALLROOM - LATER</Text></Paragraph>
          <Paragraph Type="Action"><Text>   </Text></Paragraph>
          <Paragraph><Text></Text></Paragraph>
          <Paragraph Type="General" />
          <Paragraph Type="Action"><Text>The glamorous event is in full swing.</Text></Paragraph>
          <Paragraph Type="Action"><Text></Text></Paragraph>
          <Paragraph Type="Character"><Text>ISAIAH</Text></Paragraph>
        </Content>
      </FinalDraft>
    `)

    expect(imported.rawHtml).toBe([
      '<p data-element-type="scene-heading">INT. BALLROOM - LATER</p>',
      '<p data-element-type="action">The glamorous event is in full swing.</p>',
      '<p data-element-type="character">ISAIAH</p>',
    ].join('\n'))
    expect(imported.warnings).toEqual([
      '4 blank Final Draft paragraphs dropped because WriterOS renders screenplay spacing from element rules.',
    ])
  })

  it('warns when page markers are dropped because pagination import is deferred', () => {
    const imported = importFdxXml(`
      <?xml version="1.0" encoding="UTF-8"?>
      <FinalDraft DocumentType="Script" Template="No" Version="5">
        <Content>
          <Paragraph Type="Scene Heading"><Text>INT. ROOM - DAY</Text></Paragraph>
          <Paragraph Type="Page Break" />
          <Paragraph><DynamicLabel Type="Page #" /></Paragraph>
          <Paragraph Type="Action"><Text>The next page starts here.</Text></Paragraph>
        </Content>
      </FinalDraft>
    `)

    expect(imported.rawHtml).toBe([
      '<p data-element-type="scene-heading">INT. ROOM - DAY</p>',
      '<p data-element-type="action">The next page starts here.</p>',
    ].join('\n'))
    expect(imported.warnings).toEqual([
      '2 Final Draft page markers dropped because pagination import is not yet supported.',
    ])
  })

  it('still warns when a non-blank paragraph has no Final Draft type', () => {
    const imported = importFdxXml(`
      <?xml version="1.0" encoding="UTF-8"?>
      <FinalDraft DocumentType="Script" Template="No" Version="5">
        <Content>
          <Paragraph Type="Scene Heading"><Text>INT. ROOM - DAY</Text></Paragraph>
          <Paragraph><Text>A real line with no type.</Text></Paragraph>
        </Content>
      </FinalDraft>
    `)

    expect(imported.rawHtml).toContain('<p data-element-type="action">A real line with no type.</p>')
    expect(imported.warnings).toEqual([
      'Final Draft paragraph without a type imported as Action.',
    ])
  })

  it('keeps the dirty screenshot FDX fixture free of metadata spacing blocks', () => {
    const imported = importFdxXml(readFixture('dirty-spacing.fdx'), {
      filename: 'dirty-spacing.fdx',
    })

    expect(imported.rawHtml).toBe([
      '<p data-element-type="action">A beat.</p>',
      '<p data-element-type="character">DANTE (O.S.)</p>',
      '<p data-element-type="dialogue">Roger that.</p>',
      '<p data-element-type="scene-heading">INT. BALLROOM - later</p>',
      '<p data-element-type="action">The glamorous event is in full swing. ISAIAH moves with a sense of purpose, his eyes never resting as he scans for any potential threats.</p>',
    ].join('\n'))
    expect(imported.rawHtml).not.toContain('></p>')
    expect(imported.warnings).toEqual([])
  })

  it('reports missing or blank Content safely', () => {
    expect(() => importFdxXml('<FinalDraft DocumentType="Script"><Content /></FinalDraft>')).toThrow(
      'This Final Draft file does not contain importable screenplay text.',
    )
    expect(() => importFdxXml('<FinalDraft DocumentType="Script" />')).toThrow(
      'This Final Draft file does not contain script content.',
    )
  })

  it('rejects malformed XML and non-Final Draft documents without output', () => {
    expect(() => importFdxXml('<FinalDraft><Content>')).toThrow(FdxImportError)
    expect(() => importFdxXml('<Document><Content /></Document>')).toThrow(
      'This file is not a supported Final Draft .fdx document.',
    )
  })

  it('validates file extension before reading through the file helper', async () => {
    const file = new File(['not fdx'], 'notes.txt', { type: 'text/plain' })

    await expect(importFdxFile(file)).rejects.toMatchObject({
      code: 'unsupported-extension',
    })
  })

  it('accepts uppercase FDX extensions and honors legacy XML encodings', async () => {
    const prefix = `<?xml version="1.0" encoding="windows-1252"?>
      <FinalDraft DocumentType="Script" Template="No" Version="5">
        <Content>
          <Paragraph Type="Scene Heading"><Text>INT. ROOM - DAY</Text></Paragraph>
          <Paragraph Type="Action"><Text>`
    const suffix = `</Text></Paragraph>
        </Content>
      </FinalDraft>`
    const encoded = new Uint8Array([
      ...new TextEncoder().encode(prefix),
      0x93,
      ...new TextEncoder().encode('smart quote'),
      0x94,
      ...new TextEncoder().encode(suffix),
    ])
    const file = new File([encoded], 'Legacy.FDX', { type: 'application/xml' })

    const imported = await importFdxFile(file)

    expect(imported.rawHtml).toContain('“smart quote”')
  })

  it('derives a clean fallback title from the filename', () => {
    expect(titleFromFdxFilename('the_salt-line.final.fdx')).toBe('the salt line.final')
    expect(titleFromFdxFilename('.fdx')).toBeNull()
  })
})
