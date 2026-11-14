import useInstructorSubsection from '../hooks/useInstructorSubsection'
import WorkspaceSubsectionNav from './WorkspaceSubsectionNav'
import InstructorOverallResults from './InstructorOverallResults'
import InstructorResultsDashboard from './InstructorResultsDashboard'
import InstructorCliResults from './InstructorCliResults'
import InstructorQuestionAnalytics from './InstructorQuestionAnalytics'
import InstructorPerformanceTrends from './InstructorPerformanceTrends'

export default function InstructorResultsArea({ administratorMode = false }) {
  const [activeSection, setActiveSection] = useInstructorSubsection(
    'results', administratorMode,
  )

  return (
    <div className="combined-results-workspace">
      <WorkspaceSubsectionNav
        page="results"
        activeSection={activeSection}
        onChange={setActiveSection}
      />
      <div
        id="results-subsection-overall"
        className="workspace-subsection-panel"
        hidden={activeSection !== 'overall'}
      >
        <InstructorOverallResults includeAnalytics={false} />
      </div>
      <div
        id="results-subsection-quizzes"
        className="workspace-subsection-panel"
        hidden={activeSection !== 'quizzes'}
      >
        <InstructorResultsDashboard />
      </div>
      <div
        id="results-subsection-practicals"
        className="workspace-subsection-panel"
        hidden={activeSection !== 'practicals'}
      >
        <InstructorCliResults />
      </div>
      <div
        id="results-subsection-analytics"
        className="workspace-subsection-panel"
        hidden={activeSection !== 'analytics'}
      >
        <InstructorQuestionAnalytics />
      </div>
      <div
        id="results-subsection-trends"
        className="workspace-subsection-panel"
        hidden={activeSection !== 'trends'}
      >
        <InstructorPerformanceTrends />
      </div>
    </div>
  )
}
