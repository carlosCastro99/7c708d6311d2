import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'
import { Blob as NodeBlob } from 'node:buffer'
import Papa from 'papaparse'

globalThis.Blob = NodeBlob as unknown as typeof Blob

// Add File.text() support for jsdom
if (!File.prototype.text) {
  Object.defineProperty(File.prototype, 'text', {
    value: async function () {
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = () => reject(reader.error)
        reader.readAsText(this)
      })
    },
  })
}

// Normalize PapaParse output to use LF instead of CRLF for consistent test behavior across platforms
const originalUnparse = Papa.unparse
Papa.unparse = function (data, config) {
  const result = originalUnparse.call(this, data, config)
  return typeof result === 'string' ? result.replace(/\r\n/g, '\n') : result
}

// Mock URL.createObjectURL for jsdom
const urlObjectMap = new Map<string, Blob>()
if (!URL.createObjectURL) {
  URL.createObjectURL = (blob: Blob): string => {
    const id = `blob:${Math.random().toString(36).substr(2, 9)}`
    urlObjectMap.set(id, blob)
    return id
  }
}

if (!URL.revokeObjectURL) {
  URL.revokeObjectURL = (url: string): void => {
    urlObjectMap.delete(url)
  }
}
