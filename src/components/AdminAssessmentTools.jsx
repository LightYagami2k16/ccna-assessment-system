import useWorkspaceRoute from '../hooks/useWorkspaceRoute'
import { administratorAssessmentToolPaths } from '../routing/workspaceRoutes'
import { instructorNavigation } from '../routing/assessmentNavigation'
import AssessmentWorkspaceContent from './AssessmentWorkspaceContent'

const tools = instructorNavigation.filter(({ id }) => id !== 'overview' && id !== 'competitions')

export default function AdminAssessmentTools({ user }) {
  const [section, setSection] = useWorkspaceRoute({
    role: 'administrator', initialSection: 'questions',
    sectionPaths: administratorAssessmentToolPaths,
    defaultSection: 'questions', defaultPath: administratorAssessmentToolPaths.questions,
  })
  const active = tools.find(({ id }) => id === section) ?? tools[0]
  return <section className="admin-assessment-tools" aria-labelledby="admin-assessment-tools-title">
    <header className="admin-assessment-tools__heading">
      <div><h2 id="admin-assessment-tools-title">{active.label}</h2><p>{active.description}</p></div>
      <label htmlFor="admin-assessment-tool">Assessment tool
        <select id="admin-assessment-tool" value={section} onChange={event => setSection(event.target.value)}>
          {tools.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}
        </select>
      </label>
    </header>
    <AssessmentWorkspaceContent section={section} label={active.label} user={user} administratorMode onOpenPracticals={() => setSection('cli-practicals')} />
  </section>
}
