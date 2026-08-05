import { useMemo, useState } from 'react'
import useConfirmationDialog from '../hooks/useConfirmationDialog'
import {
  createCliLabFromTemplate,
  deleteCliLabTemplate,
} from '../services/cliLabService'

export default function CliPracticalTemplateManager({ templates, onChanged }) {
  const [expanded, setExpanded] = useState(false)
  const [creatingId, setCreatingId] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [message, setMessage] = useState('')
  const [messageTone, setMessageTone] = useState('success')
  const { confirm, confirmationDialog } = useConfirmationDialog()

  const courseGroups = useMemo(() => {
    const groups = new Map()
    for (const template of templates) {
      const code = template.courses?.code ?? 'OTHER'
      if (!groups.has(code)) {
        groups.set(code, {
          code,
          title: template.courses?.title ?? 'Uncategorized',
          templates: [],
        })
      }
      groups.get(code).templates.push(template)
    }

    const order = { ITN: 1, SRWE: 2, ENSA: 3 }
    return [...groups.values()].sort(
      (left, right) =>
        (order[left.code] ?? 999) - (order[right.code] ?? 999)
        || left.code.localeCompare(right.code),
    )
  }, [templates])

  async function createDraft(template) {
    const confirmed = await confirm({
      title: 'Create practical from template?',
      message: `Create a new draft from “${template.name}”? Class assignments, attempts, commands, and results will not be copied.`,
      confirmLabel: 'Create draft',
      tone: 'default',
    })
    if (!confirmed) return

    setCreatingId(template.id)
    setMessage('')
    try {
      await createCliLabFromTemplate(template.id)
      setMessageTone('success')
      setMessage('A new draft CLI practical was created from the template.')
      await onChanged()
    } catch (error) {
      setMessageTone('error')
      setMessage(error.message)
    } finally {
      setCreatingId(null)
    }
  }

  async function removeTemplate(template) {
    const confirmed = await confirm({
      title: 'Delete practical template?',
      message: `Delete “${template.name}”? Existing practicals created from it will not be affected.`,
      confirmLabel: 'Delete template',
      tone: 'danger',
    })
    if (!confirmed) return

    setDeletingId(template.id)
    setMessage('')
    try {
      await deleteCliLabTemplate(template.id)
      await onChanged()
    } catch (error) {
      setMessageTone('error')
      setMessage(error.message)
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <section className="cli-template-manager">
      {confirmationDialog}
      <header className="cli-template-manager__header">
        <div>
          <span className="eyebrow">REUSABLE TOPOLOGIES</span>
          <h2>CLI practical templates</h2>
          <p>
            Reuse devices, physical links, instructions, and grading criteria
            without copying student records.
          </p>
        </div>
        <div className="cli-template-manager__controls">
          <span className="status-chip">
            {templates.length} {templates.length === 1 ? 'template' : 'templates'}
          </span>
          <button
            className="secondary"
            type="button"
            aria-expanded={expanded}
            aria-controls="cli-practical-template-list"
            onClick={() => setExpanded((current) => !current)}
          >
            {expanded ? 'Hide templates' : 'Show templates'}
          </button>
        </div>
      </header>

      {message && (
        <p className={`form-message form-message--${messageTone}`} role="status">
          {message}
        </p>
      )}

      {expanded && (
        <div className="cli-template-manager__body" id="cli-practical-template-list">
          {!templates.length ? (
            <div className="empty-state">
              <h3>No practical templates yet</h3>
              <p>Expand a practical and select Save as template.</p>
            </div>
          ) : courseGroups.map((group) => (
            <section className="cli-template-course" key={group.code}>
              <header>
                <span className="course-code">{group.code}</span>
                <strong>{group.title}</strong>
              </header>
              <div className="cli-template-grid">
                {group.templates.map((template) => {
                  const data = template.template_data ?? {}
                  const devices = Array.isArray(data.devices) ? data.devices : []
                  const links = Array.isArray(data.topology?.links)
                    ? data.topology.links
                    : []
                  const criteria = Array.isArray(data.criteria) ? data.criteria : []

                  return (
                    <article className="cli-template-card" key={template.id}>
                      <div>
                        <h3>{template.name}</h3>
                        <p>{template.modules?.code ?? 'All modules'}</p>
                      </div>
                      <dl>
                        <div><dt>Devices</dt><dd>{devices.length}</dd></div>
                        <div><dt>Links</dt><dd>{links.length}</dd></div>
                        <div><dt>Criteria</dt><dd>{criteria.length}</dd></div>
                        <div>
                          <dt>Duration</dt>
                          <dd>{data.durationMinutes ?? 30} minutes</dd>
                        </div>
                      </dl>
                      <div className="cli-template-card__actions">
                        <button
                          className="primary"
                          type="button"
                          disabled={creatingId === template.id}
                          onClick={() => void createDraft(template)}
                        >
                          {creatingId === template.id
                            ? 'Creating...'
                            : 'Create draft'}
                        </button>
                        <button
                          className="secondary"
                          type="button"
                          disabled={deletingId === template.id}
                          onClick={() => void removeTemplate(template)}
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
          ))}
        </div>
      )}
    </section>
  )
}
