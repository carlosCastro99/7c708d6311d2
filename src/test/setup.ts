import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'
import { Blob as NodeBlob } from 'node:buffer'

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
