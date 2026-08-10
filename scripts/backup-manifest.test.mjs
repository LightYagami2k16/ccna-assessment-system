import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  BACKUP_MANIFEST_FILE,
  createBackupManifest,
  REQUIRED_BACKUP_FILES,
  verifyBackupManifest,
} from './backup-manifest-lib.mjs'

async function createTemporaryBackup() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'ccna-backup-'))

  for (const fileName of REQUIRED_BACKUP_FILES) {
    await writeFile(
      path.join(directory, fileName),
      `-- test backup artifact: ${fileName}\n`,
      'utf8',
    )
  }

  return directory
}

test('creates and verifies a complete backup manifest', async (context) => {
  const directory = await createTemporaryBackup()
  context.after(() => rm(directory, { recursive: true, force: true }))

  const manifest = await createBackupManifest(directory, {
    projectRef: 'test-project',
  })
  const verified = await verifyBackupManifest(directory)

  assert.equal(manifest.version, 1)
  assert.equal(verified.projectRef, 'test-project')
  assert.deepEqual(verified.verifiedFiles, REQUIRED_BACKUP_FILES)
})

test('detects a backup file changed after manifest creation', async (context) => {
  const directory = await createTemporaryBackup()
  context.after(() => rm(directory, { recursive: true, force: true }))

  await createBackupManifest(directory)
  await writeFile(path.join(directory, 'data.sql'), '-- changed\n', 'utf8')

  await assert.rejects(
    verifyBackupManifest(directory),
    /data\.sql failed its integrity check/,
  )
})

test('rejects a manifest that omits a required artifact', async (context) => {
  const directory = await createTemporaryBackup()
  context.after(() => rm(directory, { recursive: true, force: true }))

  const manifest = await createBackupManifest(directory)
  delete manifest.files['roles.sql']
  await writeFile(
    path.join(directory, BACKUP_MANIFEST_FILE),
    JSON.stringify(manifest),
    'utf8',
  )

  await assert.rejects(
    verifyBackupManifest(directory),
    /roles\.sql is missing from the backup manifest/,
  )
})
