import { useEffect, useRef, useState } from 'react'
import useConfirmationDialog from '../hooks/useConfirmationDialog'
import {
  getCourses,
  getModules,
  importQuestionBank,
} from '../services/questionService'
import {
  applyQuestionImportDestination,
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

export default function QuestionBankPortability({
  questions,
  moduleVersion = 0,
  onImported,
}) {
  const inputRef = useRef(null)
  const [sourcePayload, setSourcePayload] = useState(null)
  const [pendingPackage, setPendingPackage] = useState(null)
  const [validationReport, setValidationReport] = useState(null)
  const [selectedFilename, setSelectedFilename] = useState('')
  const [message, setMessage] = useState('')
  const [messageTone, setMessageTone] = useState('success')
  const [importing, setImporting] = useState(false)
  const [destinationMode, setDestinationMode] = useState('file')
  const [courses, setCourses] = useState([])
  const [modules, setModules] = useState([])
  const [selectedCourseId, setSelectedCourseId] = useState('')
  const [selectedModuleId, setSelectedModuleId] = useState('')
  const [destinationLoading, setDestinationLoading] = useState(true)
  const { confirm, confirmationDialog } = useConfirmationDialog()

  const selectedCourse = courses.find(
    (course) => String(course.id) === selectedCourseId,
  )
  const selectedModule = modules.find(
    (module) => String(module.id) === selectedModuleId,
  )
  const selectedDestinationReady = Boolean(
    selectedCourse && selectedModule,
  )

  useEffect(() => {
    let active = true

    async function loadDestinations() {
      try {
        setDestinationLoading(true)
        const courseRows = await getCourses()
        if (active) setCourses(courseRows)
      } catch (error) {
        if (active) {
          setMessageTone('error')
          setMessage(error.message)
        }
      } finally {
        if (active) setDestinationLoading(false)
      }
    }

    void loadDestinations()
    return () => {
      active = false
    }
  }, [moduleVersion])

  useEffect(() => {
    let active = true
    setModules([])
    setSelectedModuleId('')

    if (!selectedCourseId) return undefined

    async function loadCourseModules() {
      try {
        const moduleRows = await getModules(selectedCourseId)
        if (active) setModules(moduleRows)
      } catch (error) {
        if (active) {
          setMessageTone('error')
          setMessage(error.message)
        }
      }
    }

    void loadCourseModules()
    return () => {
      active = false
    }
  }, [selectedCourseId, moduleVersion])

  useEffect(() => {
    if (!sourcePayload) return

    if (destinationMode === 'module' && !selectedDestinationReady) {
      setPendingPackage(null)
      setValidationReport(null)
      setMessageTone('error')
      setMessage('Choose a destination course and module to validate this file.')
      return
    }

    try {
      const payload = destinationMode === 'module'
        ? applyQuestionImportDestination(sourcePayload, {
            courseCode: selectedCourse.code,
            moduleCode: selectedModule.code,
          })
        : sourcePayload
      const analysis = analyzeQuestionBankPackage(payload)
      setPendingPackage(
        analysis.report.validCount > 0
          ? analysis.importPackage
          : null,
      )
      setValidationReport(analysis.report)
      if (analysis.report.invalidCount > 0) {
        setMessageTone('error')
        setMessage(
          `${analysis.report.invalidCount} question(s) were rejected during validation. Download the report for details.`,
        )
      } else {
        setMessage('')
      }
    } catch (error) {
      setPendingPackage(null)
      setValidationReport(null)
      setMessageTone('error')
      setMessage(error.message)
    }
  }, [
    destinationMode,
    selectedCourse,
    selectedDestinationReady,
    selectedModule,
    sourcePayload,
  ])

  function clearSelection() {
    setSourcePayload(null)
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
      setSelectedFilename(file.name)
      setSourcePayload(payload)
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
      setSourcePayload(null)
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
        description="Import multiple-choice, multiple-answer, true/false, and identification questions using file codes or one selected destination module."
        actions={(
          <div className="question-portability-panel__header-actions">
            <a
              className="secondary"
              href={`${import.meta.env.BASE_URL}templates/ccna-question-bank-import-template.json`}
              download
            >
              Download JSON template
            </a>
            <button
              className="secondary"
              type="button"
              disabled={!questions.length}
              onClick={() => downloadJson(createQuestionBankPackage(questions))}
            >
              Export question bank
            </button>
          </div>
        )}
      />

      <div className="question-portability-panel__import">
        <fieldset className="question-import-destination">
          <legend>Import destination</legend>
          <div className="question-import-destination__modes">
            <label>
              <input
                type="radio"
                name="question-import-destination"
                value="file"
                checked={destinationMode === 'file'}
                disabled={importing}
                onChange={() => setDestinationMode('file')}
              />
              <span>
                <strong>Use codes from the JSON file</strong>
                <small>Best for files containing questions from several modules.</small>
              </span>
            </label>
            <label>
              <input
                type="radio"
                name="question-import-destination"
                value="module"
                checked={destinationMode === 'module'}
                disabled={importing}
                onChange={() => setDestinationMode('module')}
              />
              <span>
                <strong>Import all questions into one module</strong>
                <small>Overrides every course and module code in the selected file.</small>
              </span>
            </label>
          </div>

          {destinationMode === 'module' && (
            <div className="question-import-destination__selectors">
              <label>
                Destination course
                <select
                  value={selectedCourseId}
                  disabled={destinationLoading || importing}
                  required
                  onChange={(event) =>
                    setSelectedCourseId(event.target.value)
                  }
                >
                  <option value="">Select a course</option>
                  {courses.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.code} — {course.title}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Destination module
                <select
                  value={selectedModuleId}
                  disabled={!selectedCourseId || importing}
                  required
                  onChange={(event) =>
                    setSelectedModuleId(event.target.value)
                  }
                >
                  <option value="">Select a module</option>
                  {modules.map((module) => (
                    <option key={module.id} value={module.id}>
                      {module.code} — {module.title}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
        </fieldset>

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
              <small>
                {destinationMode === 'module'
                  ? `Destination: ${selectedCourse?.code} / ${selectedModule?.code}`
                  : 'Destination: course and module codes from file'}
              </small>
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
