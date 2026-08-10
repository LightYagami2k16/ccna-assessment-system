import process from 'node:process'
import {
  createBackupManifest,
  verifyBackupManifest,
} from './backup-manifest-lib.mjs'

const [mode, directory] = process.argv.slice(2)

if (!['create', 'verify'].includes(mode) || !directory) {
  console.error(
    'Usage: node scripts/backup-manifest.mjs <create|verify> <backup-directory>',
  )
  process.exit(1)
}

try {
  if (mode === 'create') {
    const manifest = await createBackupManifest(directory, {
      projectRef: process.env.SUPABASE_PROJECT_REF,
    })
    console.log(
      `Backup manifest created for ${Object.keys(manifest.files).length} files.`,
    )
  } else {
    const result = await verifyBackupManifest(directory)
    console.log(
      `Backup integrity verified for ${result.verifiedFiles.length} files.`,
    )
  }
} catch (error) {
  console.error(error?.message ?? 'Backup integrity check failed.')
  process.exit(1)
}
