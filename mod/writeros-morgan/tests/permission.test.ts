// mod/writeros-morgan/tests/permission.test.ts
import { test, expect } from 'claude-code/testing'
import { describePermission } from '../hooks/permission'

test('summaries show the real action, not only the model\'s description of it', () => {
  expect(describePermission('Edit', { file_path: '/icloud/P/wayfinder/resolved/28.md' })).toBe('Edit 28.md (/icloud/P/wayfinder/resolved/28.md)')
  expect(describePermission('Write', { file_path: '/a/new.md' })).toBe('Create or overwrite new.md (/a/new.md)')
  expect(describePermission('Bash', { command: 'npm run memory -- import --apply', description: 'Import beat sheet to canon' }))
    .toBe('Run: npm run memory -- import --apply — "Import beat sheet to canon"')
  expect(describePermission('WebFetch', { url: 'https://example.com/x' })).toBe('Open a web page: https://example.com/x')
  expect(describePermission('Other', {})).toBe('Use Other')
})
