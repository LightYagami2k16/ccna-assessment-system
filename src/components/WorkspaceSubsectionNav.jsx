import { workspaceSubsections } from '../routing/workspaceSubsections'

export default function WorkspaceSubsectionNav({ page, activeSection, onChange }) {
  const { label, sections } = workspaceSubsections[page]

  return (
    <nav className="workspace-subsections" aria-label={label}>
      {sections.map(({ id, label: sectionLabel }) => (
        <button
          type="button"
          key={id}
          className="workspace-subsections__button"
          aria-current={activeSection === id ? 'page' : undefined}
          aria-controls={`${page}-subsection-${id}`}
          onClick={() => onChange(id)}
        >
          {sectionLabel}
        </button>
      ))}
    </nav>
  )
}
