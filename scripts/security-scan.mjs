import { execFileSync } from 'node:child_process'
import { readFileSync, statSync } from 'node:fs'
import { extname } from 'node:path'
import { scanTextForSecrets } from './security-scan-lib.mjs'

const TEXT_EXTENSIONS = new Set([
  '', '.css', '.env', '.html', '.js', '.jsx', '.json', '.md', '.mjs',
  '.sql', '.ts', '.txt', '.yaml', '.yml',
])
const MAX_FILE_BYTES = 2 * 1024 * 1024

function repositoryFiles() {
  const output = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { encoding: 'utf8' },
  )

  return output.split('\0').filter(Boolean)
}

const findings = []

for (const file of repositoryFiles()) {
  if (!TEXT_EXTENSIONS.has(extname(file).toLowerCase())) continue
  if (statSync(file).size > MAX_FILE_BYTES) continue

  const text = readFileSync(file, 'utf8')
  for (const finding of scanTextForSecrets(text)) {
    findings.push({ file, ...finding })
  }
}

if (findings.length) {
  process.stderr.write('Potential repository secrets were detected:\n')
  for (const finding of findings) {
    process.stderr.write(
      `- ${finding.file}:${finding.line} (${finding.rule})\n`,
    )
  }
  process.stderr.write('Matched values are intentionally not displayed.\n')
  process.exitCode = 1
} else {
  process.stdout.write('Repository secret scan passed.\n')
}
