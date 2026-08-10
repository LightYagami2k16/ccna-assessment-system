import { useRef, useState } from 'react'
import useConfirmationDialog from '../hooks/useConfirmationDialog'
import {
  exportInstructorContentBackup,
  restoreInstructorContentBackup,
} from '../services/contentBackupService'
import {
  instructionalBackupFilename,
  summarizeInstructionalBackup,
  validateInstructionalBackup,
} from '../services/contentBackupPortability'

const summaryLabels = {
  modules: 'Modules',
  questions: 'Questions',
  quizzes: 'Quizzes',
  quizTemplates: 'Quiz templates',
  cliPracticals: 'CLI practicals',
  cliTemplates: 'CLI templates',
}

function downloadBackup(payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = instructionalBackupFilename()
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function resultText(result) {
  const groups = [
    ['modules', 'modules'],
    ['questions', 'questions'],
    ['quizzes', 'quizzes'],
    ['quizTemplates', 'quiz templates'],
    ['cliPracticals', 'CLI practicals'],
    ['cliTemplates', 'CLI templates'],
  ]
  return groups.map(([key, label]) => {
    const item = result?.[key] ?? {}
    return `${item.imported ?? 0} ${label} restored, ${item.skipped ?? 0} skipped`
  }).join('; ')
}

export default function InstructorContentBackup() {
  const inputRef = useRef(null)
  const [payload, setPayload] = useState(null)
  const [summary, setSummary] = useState(null)
  const [filename, setFilename] = useState('')
  const [exporting, setExporting] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [message, setMessage] = useState('')
  const [messageTone, setMessageTone] = useState('success')
  const { confirm, confirmationDialog } = useConfirmationDialog()

  function clearFile() {
    setPayload(null)
    setSummary(null)
    setFilename('')
    if (inputRef.current) inputRef.current.value = ''
  }

  async function handleExport() {
    try {
      setExporting(true)
      setMessage('')
      const backup = validateInstructionalBackup(
        await exportInstructorContentBackup(),
      )
      downloadBackup(backup)
      setMessageTone('success')
      setMessage('Instructional-content backup downloaded successfully.')
    } catch (error) {
      setMessageTone('error')
      setMessage(error.message)
    } finally {
      setExporting(false)
    }
  }

  async function handleFileSelection(event) {
    const file = event.target.files?.[0]
    clearFile()
    setMessage('')
    if (!file) return

    try {
      if (file.size > 25 * 1024 * 1024) {
        throw new Error('The selected backup must be 25 MB or smaller.')
      }
      const selectedPayload = validateInstructionalBackup(
        JSON.parse(await file.text()),
      )
      setPayload(selectedPayload)
      setSummary(summarizeInstructionalBackup(selectedPayload))
      setFilename(file.name)
    } catch (error) {
      setMessageTone('error')
      setMessage(error instanceof SyntaxError
        ? 'The selected backup is not valid JSON.'
        : error.message)
    }
  }

  async function handleRestore() {
    if (!payload || !summary) return
    const confirmed = await confirm({
      title: 'Restore instructional content?',
      message: `Restore ${summary.total} content records? New questions, quizzes, and practicals will be drafts. Matching existing records will be skipped. Student records and live assignments will not be changed.`,
      confirmLabel: 'Restore content',
      tone: 'default',
    })
    if (!confirmed) return

    try {
      setRestoring(true)
      setMessage('')
      const result = await restoreInstructorContentBackup(payload)
      setMessageTone('success')
      setMessage(`Restore complete: ${resultText(result)}.`)
      clearFile()
    } catch (error) {
      setMessageTone('error')
      setMessage(error.message)
    } finally {
      setRestoring(false)
    }
  }

  return (
    <div className="content-backup-workspace">
      {confirmationDialog}

      <section className="content-backup-card">
        <div className="section-heading">
          <div>
            <span className="eyebrow">CONTENT PROTECTION</span>
            <h2>Download a complete content backup</h2>
            <p>
              Save the shared curriculum library and your own quizzes,
              practicals, and reusable templates in one portable JSON file.
            </p>
          </div>
          <button
            className="primary"
            type="button"
            disabled={exporting || restoring}
            onClick={() => void handleExport()}
          >
            {exporting ? 'Preparing backup...' : 'Download backup'}
          </button>
        </div>

        <div className="content-backup-scope">
          <strong>Included</strong>
          <p>Courses, modules, questions and answers, quizzes, CLI practicals, topologies, grading criteria, and templates.</p>
          <strong>Always excluded</strong>
          <p>Accounts, classes, enrollments, assignments, schedules, attempts, answers, scores, commands, and monitoring events.</p>
        </div>
      </section>

      <section className="content-backup-card">
        <div className="section-heading">
          <div>
            <span className="eyebrow">SAFE RESTORE</span>
            <h2>Restore instructional content</h2>
            <p>
              Restore additively without replacing live content. Imported
              assessments remain drafts until you review and publish them.
            </p>
          </div>
        </div>

        <label className="content-backup-file">
          Backup JSON file
          <input
            ref={inputRef}
            type="file"
            accept="application/json,.json"
            disabled={exporting || restoring}
            onChange={(event) => void handleFileSelection(event)}
          />
        </label>

        {summary && (
          <div className="content-backup-preview" role="status">
            <div className="content-backup-preview__heading">
              <div>
                <strong>{filename}</strong>
                <span>{summary.total} restorable content records</span>
              </div>
              <button
                className="secondary"
                type="button"
                disabled={restoring}
                onClick={clearFile}
              >
                Clear file
              </button>
            </div>

            <div className="content-backup-summary">
              {Object.entries(summaryLabels).map(([key, label]) => (
                <div key={key}>
                  <span>{label}</span>
                  <strong>{summary[key]}</strong>
                </div>
              ))}
            </div>

            <button
              className="primary content-backup-restore"
              type="button"
              disabled={restoring}
              onClick={() => void handleRestore()}
            >
              {restoring ? 'Restoring content...' : 'Restore validated backup'}
            </button>
          </div>
        )}
      </section>

      {message && (
        <p className={`form-message form-message--${messageTone}`} role="status">
          {message}
        </p>
      )}
    </div>
  )
}

