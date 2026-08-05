import { useMemo, useState } from 'react'
import useConfirmationDialog from '../hooks/useConfirmationDialog'
import {
  createQuizFromTemplate,
  deleteQuizTemplate,
} from '../services/quizBuilderService'

export default function QuizTemplateManager({ templates, onChanged }) {
  const [expanded, setExpanded] = useState(false)
  const [creatingId, setCreatingId] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [message, setMessage] = useState('')
  const { confirm, confirmationDialog } = useConfirmationDialog()

  const groupedTemplates = useMemo(() => {
    const groups = new Map()

    for (const template of templates) {
      const courseCode = template.courses?.code ?? 'OTHER'
      if (!groups.has(courseCode)) {
        groups.set(courseCode, {
          code: courseCode,
          title: template.courses?.title ?? 'Uncategorized',
          templates: [],
        })
      }
      groups.get(courseCode).templates.push(template)
    }

    const order = { ITN: 1, SRWE: 2, ENSA: 3 }
    return [...groups.values()].sort(
      (left, right) =>
        (order[left.code] ?? 999) - (order[right.code] ?? 999) ||
        left.code.localeCompare(right.code),
    )
  }, [templates])

  async function handleCreate(template) {
    const confirmed = await confirm({
      title: 'Create quiz from template?',
      message: `Create a new draft quiz from “${template.name}”? Class assignments and availability schedules will not be copied.`,
      confirmLabel: 'Create draft',
      tone: 'default',
    })
    if (!confirmed) return

    setCreatingId(template.id)
    setMessage('')
    try {
      await createQuizFromTemplate(template.id)
      setMessage('A new draft quiz was created from the template.')
      await onChanged()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setCreatingId(null)
    }
  }

  async function handleDelete(template) {
    const confirmed = await confirm({
      title: 'Delete quiz template?',
      message: `Delete “${template.name}”? Existing quizzes created from it will not be affected.`,
      confirmLabel: 'Delete template',
      tone: 'danger',
    })
    if (!confirmed) return

    setDeletingId(template.id)
    setMessage('')
    try {
      await deleteQuizTemplate(template.id)
      await onChanged()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <section className="quiz-template-manager">
      {confirmationDialog}
      <header className="quiz-template-manager__header">
        <div>
          <span className="eyebrow">REUSABLE CONTENT</span>
          <h3>Quiz templates</h3>
          <p>
            Reuse quiz settings and questions without copying assignments,
            schedules, attempts, or results.
          </p>
        </div>

        <div className="quiz-template-manager__controls">
          <span className="count-badge">
            {templates.length} {templates.length === 1 ? 'Template' : 'Templates'}
          </span>
          <button
            className="secondary"
            type="button"
            aria-expanded={expanded}
            aria-controls="quiz-template-list"
            onClick={() => setExpanded((current) => !current)}
          >
            {expanded ? 'Hide templates' : 'Show templates'}
          </button>
        </div>
      </header>

      {message && (
        <p
          className={`form-message ${
            message.toLowerCase().includes('created')
              ? 'form-message--success'
              : 'form-message--error'
          }`}
        >
          {message}
        </p>
      )}

      {expanded && (
        <div className="quiz-template-manager__body" id="quiz-template-list">
          {!templates.length ? (
            <div className="empty-state">
              <h4>No quiz templates yet</h4>
              <p>Use Save as template on any quiz to create one.</p>
            </div>
          ) : (
            groupedTemplates.map((group) => (
              <section className="quiz-template-course" key={group.code}>
                <header>
                  <span className="course-code">{group.code}</span>
                  <strong>{group.title}</strong>
                </header>

                <div className="quiz-template-grid">
                  {group.templates.map((template) => {
                    const data = template.template_data ?? {}
                    const questionCount =
                      data.questionSelectionMode === 'random_database'
                        ? `${data.randomQuestionCount ?? 0} random`
                        : `${data.questionIds?.length ?? 0} selected`

                    return (
                      <article className="quiz-template-card" key={template.id}>
                        <div>
                          <h4>{template.name}</h4>
                          <p>
                            {template.modules?.code ?? 'All modules'} ·{' '}
                            {questionCount} questions
                          </p>
                        </div>

                        <dl>
                          <div>
                            <dt>Duration</dt>
                            <dd>{data.durationMinutes ?? 15} minutes</dd>
                          </div>
                          <div>
                            <dt>Passing score</dt>
                            <dd>{data.passingScore ?? 70}%</dd>
                          </div>
                        </dl>

                        <div className="quiz-template-card__actions">
                          <button
                            className="primary"
                            type="button"
                            disabled={creatingId === template.id}
                            onClick={() => void handleCreate(template)}
                          >
                            {creatingId === template.id
                              ? 'Creating...'
                              : 'Create draft'}
                          </button>
                          <button
                            className="secondary"
                            type="button"
                            disabled={deletingId === template.id}
                            onClick={() => void handleDelete(template)}
                          >
                            {deletingId === template.id
                              ? 'Deleting...'
                              : 'Delete template'}
                          </button>
                        </div>
                      </article>
                    )
                  })}
                </div>
              </section>
            ))
          )}
        </div>
      )}
    </section>
  )
}
