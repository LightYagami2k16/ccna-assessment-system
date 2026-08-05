import { useRef, useState } from 'react'
import useConfirmationDialog from '../hooks/useConfirmationDialog'
import { importQuestionBank } from '../services/questionService'
import {
  createQuestionBankPackage,
  questionBankFilename,
  validateQuestionBankPackage,
} from '../services/questionBankPortability'

function downloadJson(payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = questionBankFilename()
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export default function QuestionBankPortability({ questions, onImported }) {
  const inputRef = useRef(null)
  const [pendingPackage, setPendingPackage] = useState(null)
  const [selectedFilename, setSelectedFilename] = useState('')
  const [message, setMessage] = useState('')
  const [messageTone, setMessageTone] = useState('success')
  const [importing, setImporting] = useState(false)
  const { confirm, confirmationDialog } = useConfirmationDialog()

  function clearSelection() {
    setPendingPackage(null)
    setSelectedFilename('')
    if (inputRef.current) inputRef.current.value = ''
  }

  async function handleFileSelection(event) {
    const file = event.target.files?.[0]
    setPendingPackage(null)
    setSelectedFilename('')
    setMessage('')
    if (!file) return

    try {
      if (file.size > 5 * 1024 * 1024) {
        throw new Error('The selected file must be 5 MB or smaller.')
      }
      const payload = JSON.parse(await file.text())
      const validated = validateQuestionBankPackage(payload)
      setPendingPackage(validated)
      setSelectedFilename(file.name)
    } catch (error) {
      setMessageTone('error')
      setMessage(error instanceof SyntaxError
        ? 'The selected file is not valid JSON.'
        : error.message)
    }
  }

  async function handleImport() {
    if (!pendingPackage) return
    const confirmed = await confirm({
      title: 'Import question bank?',
      message: `Import ${pendingPackage.questions.length} validated questions? Existing matching questions will be skipped, and imported questions will be saved as drafts.`,
      confirmLabel: 'Import questions',
      tone: 'default',
    })
    if (!confirmed) return

    try {
      setImporting(true)
      setMessage('')
      const result = await importQuestionBank(pendingPackage)
      setMessageTone('success')
      setMessage(
        `${result.importedCount} imported as drafts. ${result.skippedCount} duplicates skipped.`,
      )
      clearSelection()
      await onImported?.()
    } catch (error) {
      setMessageTone('error')
      setMessage(error.message)
    } finally {
      setImporting(false)
    }
  }

  return (
    <section className="question-portability-panel">
      {confirmationDialog}
      <div className="section-heading question-portability-panel__heading">
        <div>
          <span className="eyebrow">CONTENT PORTABILITY</span>
          <h2>Question bank import and export</h2>
          <p>
            Download a reusable JSON backup or import questions into matching
            course and module codes.
          </p>
        </div>
        <button
          className="secondary"
          type="button"
          disabled={!questions.length}
          onClick={() => downloadJson(createQuestionBankPackage(questions))}
        >
          Export question bank
        </button>
      </div>

      <div className="question-portability-panel__import">
        <label>
          Question-bank JSON file
          <input
            ref={inputRef}
            type="file"
            accept="application/json,.json"
            disabled={importing}
            onChange={(event) => void handleFileSelection(event)}
          />
        </label>

        {pendingPackage && (
          <div className="question-portability-preview" role="status">
            <div>
              <strong>{selectedFilename}</strong>
              <span>
                {pendingPackage.questions.length}{' '}
                {pendingPackage.questions.length === 1 ? 'question' : 'questions'}
              </span>
            </div>
            <p>
              The file is valid. Imported questions remain unpublished until
              an instructor reviews them.
            </p>
          </div>
        )}

        <div className="question-portability-panel__actions">
          <button
            className="primary"
            type="button"
            disabled={!pendingPackage || importing}
            onClick={() => void handleImport()}
          >
            {importing ? 'Importing...' : 'Import validated questions'}
          </button>
          {pendingPackage && (
            <button
              className="secondary"
              type="button"
              disabled={importing}
              onClick={clearSelection}
            >
              Clear file
            </button>
          )}
        </div>
      </div>

      {message && (
        <p className={`form-message form-message--${messageTone}`} role="status">
          {message}
        </p>
      )}
    </section>
  )
}
