import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

export const BACKUP_MANIFEST_FILE = 'backup-manifest.json'
export const REQUIRED_BACKUP_FILES = [
  'roles.sql',
  'schema.sql',
  'data.sql',
]

async function sha256(filePath) {
  const hash = createHash('sha256')

  await new Promise((resolve, reject) => {
    const stream = createReadStream(filePath)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('end', resolve)
    stream.on('error', reject)
  })

  return hash.digest('hex')
}

async function inspectBackupFile(directory, fileName) {
  const filePath = path.join(directory, fileName)
  const fileStats = await stat(filePath)

  if (!fileStats.isFile() || fileStats.size === 0) {
    throw new Error(`${fileName} is missing or empty.`)
  }

  return {
    bytes: fileStats.size,
    sha256: await sha256(filePath),
  }
}

export async function createBackupManifest(directory, options = {}) {
  const resolvedDirectory = path.resolve(directory)
  const files = {}

  for (const fileName of REQUIRED_BACKUP_FILES) {
    files[fileName] = await inspectBackupFile(
      resolvedDirectory,
      fileName,
    )
  }

  const manifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    projectRef: options.projectRef || null,
    files,
  }

  await writeFile(
    path.join(resolvedDirectory, BACKUP_MANIFEST_FILE),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  )

  return manifest
}

export async function verifyBackupManifest(directory) {
  const resolvedDirectory = path.resolve(directory)
  const manifestPath = path.join(
    resolvedDirectory,
    BACKUP_MANIFEST_FILE,
  )
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))

  if (manifest.version !== 1 || !manifest.files) {
    throw new Error('The backup manifest format is not supported.')
  }

  const verifiedFiles = []

  for (const fileName of REQUIRED_BACKUP_FILES) {
    const expected = manifest.files[fileName]
    if (!expected) {
      throw new Error(`${fileName} is missing from the backup manifest.`)
    }

    const actual = await inspectBackupFile(resolvedDirectory, fileName)
    if (
      actual.bytes !== expected.bytes
      || actual.sha256 !== expected.sha256
    ) {
      throw new Error(`${fileName} failed its integrity check.`)
    }

    verifiedFiles.push(fileName)
  }

  return {
    generatedAt: manifest.generatedAt,
    projectRef: manifest.projectRef,
    verifiedFiles,
  }
}
