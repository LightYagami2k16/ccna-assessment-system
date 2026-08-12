import { useRef, useState } from 'react'
import useConfirmationDialog from '../hooks/useConfirmationDialog'
import { importQuestionBank } from '../services/questionService'
import {
  analyzeQuestionBankPackage,
  createValidationReportCsv,
  createQuestionBankPackage,
  questionBankFilename,
  validationReportFilename,
} from '../services/questionBankPortability'
import { ActionBar, SectionHeader, SurfaceCard } from './LayoutPrimitives'

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

function downloadValidationReport(report) {
  const blob = new Blob([createValidationReportCsv(report)], {
    type: 'text/csv;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = validationReportFilename()
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export default function QuestionBankPortability({ questions, onImported }) {
  const inputRef = useRef(null)
  const [pendingPackage, setPendingPackage] = useState(null)
  const [validationReport, setValidationReport] = useState(null)
  const [selectedFilename, setSelectedFilename] = useState('')
  const [message, setMessage] = useState('')
  const [messageTone, setMessageTone] = useState('success')
  const [importing, setImporting] = useState(false)
  const { confirm, confirmationDialog } = useConfirmationDialog()

  function clearSelection() {
    setPendingPackage(null)
    setValidationReport(null)
    setSelectedFilename('')
    if (inputRef.current) inputRef.current.value = ''
  }

  async function handleFileSelection(event) {
    const file = event.target.files?.[0]
    setPendingPackage(null)
    setValidationReport(null)
    setSelectedFilename('')
    setMessage('')
    if (!file) return

    try {
      if (file.size > 5 * 1024 * 1024) {
        throw new Error('The selected file must be 5 MB or smaller.')
      }
      const payload = JSON.parse(await file.text())
      const analysis = analyzeQuestionBankPackage(payload)
      setPendingPackage(
        analysis.report.validCount > 0
          ? analysis.importPackage
          : null,
      )
      setValidationReport(analysis.report)
      setSelectedFilename(file.name)
      if (analysis.report.invalidCount > 0) {
        setMessageTone('error')
        setMessage(
          `${analysis.report.invalidCount} question(s) were rejected during validation. Download the report for details.`,
        )
      }
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
      message: `Import ${pendingPackage.questions.length} validated questions? ${validationReport?.invalidCount ?? 0} rejected question(s) will be excluded. Existing matching questions will be skipped, and imported questions will be saved as drafts.`,
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
        `${result.importedCount} imported as drafts. ${result.skippedCount} duplicates skipped. ${validationReport?.invalidCount ?? 0} invalid question(s) excluded.`,
      )
      setPendingPackage(null)
      if (inputRef.current) inputRef.current.value = ''
      await onImported?.()
    } catch (error) {
      setMessageTone('error')
      setMessage(error.message)
    } finally {
      setImporting(false)
    }
  }

  return (
    <SurfaceCard as="section" subtle className="question-portability-panel">
      {confirmationDialog}
      <SectionHeader
        className="section-heading question-portability-panel__heading"
        eyebrow="CONTENT PORTABILITY"
        title="Question bank import and export"
        description="Download a reusable JSON backup or import questions into matching course and module codes."
        actions={(
          <button
            className="secondary"
            type="button"
            disabled={!questions.length}
            onClick={() => downloadJson(createQuestionBankPackage(questions))}
          >
            Export question bank
          </button>
        )}
      />

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

        {validationReport && (
          <div className="question-portability-preview" role="status">
            <div>
              <strong>{selectedFilename}</strong>
              <span>
                {validationReport.totalCount}{' '}
                {validationReport.totalCount === 1 ? 'question' : 'questions'}
              </span>
            </div>
            <div className="question-validation-summary">
              <div>
                <span>Total rows</span>
                <strong>{validationReport.totalCount}</strong>
              </div>
              <div className="question-validation-summary--valid">
                <span>Ready to import</span>
                <strong>{validationReport.validCount}</strong>
              </div>
              <div className="question-validation-summary--invalid">
                <span>Rejected</span>
                <strong>{validationReport.invalidCount}</strong>
              </div>
            </div>

            {validationReport.invalidCount > 0 && (
              <div className="question-validation-errors">
                <strong>Rejected questions</strong>
                <ul>
                  {validationReport.entries
                    .filter((entry) => entry.status === 'invalid')
                    .slice(0, 8)
                    .map((entry) => (
                      <li key={entry.row}>
                        <span>Row {entry.row}: {entry.title}</span>
                        <small>{entry.message}</small>
                      </li>
                    ))}
                </ul>
                {validationReport.invalidCount > 8 && (
                  <small>
                    Download the report to view all rejected questions.
                  </small>
                )}
              </div>
            )}

            <button
              className="secondary"
              type="button"
              onClick={() => downloadValidationReport(validationReport)}
            >
              Download validation report
            </button>
          </div>
        )}

        <ActionBar className="question-portability-panel__actions">
          <button
            className="primary"
            type="button"
            disabled={!pendingPackage || importing}
            onClick={() => void handleImport()}
          >
            {importing ? 'Importing...' : 'Import validated questions'}
          </button>
          {validationReport && (
            <button
              className="secondary"
              type="button"
              disabled={importing}
              onClick={clearSelection}
            >
              Clear file
            </button>
          )}
        </ActionBar>
      </div>

      {message && (
        <p className={`form-message form-message--${messageTone}`} role="status">
          {message}
        </p>
      )}
    </SurfaceCard>
  )
}
