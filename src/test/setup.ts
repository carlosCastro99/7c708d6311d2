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
