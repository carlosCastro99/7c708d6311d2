import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db } from '../db/schema'
import { createUser } from '../db/repositories/userRepository'
import BackupPage from './BackupPage'

afterEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('BackupPage', () => {
  it('renders an export link once a backup is generated', async () => {
    await createUser('Alex')
    render(<BackupPage />)

    const link = await screen.findByRole('link', { name: /export backup/i })
    expect(link).toHaveAttribute('download', 'mx-inventory-backup.zip')
  })

  it('warns before import and replaces all data on confirm', async () => {
    await createUser('Old User')
    render(<BackupPage />)

    // Build a real backup blob from a *different* dataset to import.
    await Promise.all(db.tables.map((t) => t.clear()))
    await createUser('New User')
    const { exportBackup } = await import('../domain/backup')
    const zip = await exportBackup()
    await Promise.all(db.tables.map((t) => t.clear()))
    await createUser('Old User')

    // Build the File from raw bytes, not the Blob object itself: jsdom's File
    // constructor doesn't recognize the overridden Node Blob (see setup.ts)
    // as a blob-like part and silently stringifies it instead of reading its
    // bytes. Same root cause as the Blob/JSZip workarounds in backup.ts.
    const zipBytes = new Uint8Array(await zip.arrayBuffer())
    const file = new File([zipBytes], 'backup.zip', { type: 'application/zip' })
    const input = screen.getByLabelText(/restore from backup/i) as HTMLInputElement
    fireEvent.change(input, { target: { files: [file] } })

    expect(await screen.findByText(/replaces all data/i)).toBeInTheDocument()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /confirm/i }))

    await waitFor(async () => {
      const users = await db.users.toArray()
      expect(users.map((u) => u.name)).toEqual(['New User'])
    })
  })

  it('clears all data after confirming in the danger zone', async () => {
    await createUser('Alex')
    render(<BackupPage />)
    await screen.findByRole('link', { name: /export backup/i })

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: /^clear all data$/i }))
    await user.click(screen.getByRole('button', { name: /confirm — clear all data/i }))

    await waitFor(async () => {
      expect(await db.users.count()).toBe(0)
    })
    expect(await screen.findByText(/all data has been cleared/i)).toBeInTheDocument()
  })
})
