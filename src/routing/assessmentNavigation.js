import { Archive, ChartNoAxesColumn, ClipboardList, LayoutDashboard, Library, MonitorCheck, SquareTerminal, Users } from 'lucide-react'

export const instructorNavigation = [
  {id:'competitions',icon:SquareTerminal,label:'CLI Duels',description:'Timed configuration challenges'},
  {
    id: 'overview',
    icon: LayoutDashboard,
    label: 'Overview',
    description: 'Teaching priorities and shortcuts',
  },
  {
    id: 'questions',
    icon: Library,
    label: 'Question bank',
    description: 'Modules and reusable questions',
  },
  {
    id: 'quizzes',
    icon: ClipboardList,
    label: 'Quizzes',
    description: 'Build and publish assessments',
  },
  {
    id: 'cli-practicals',
    icon: SquareTerminal,
    label: 'CLI practicals',
    description: 'Create Cisco configuration exams',
  },
  {
    id: 'assignments',
    icon: Users,
    label: 'Classes & assignments',
    description: 'Enrollment and quiz access',
  },
  {
    id: 'exam-controls',
    icon: MonitorCheck,
    label: 'Exam controls',
    description: 'Schedules and live monitoring',
  },
  {
    id: 'results',
    icon: ChartNoAxesColumn,
    label: 'Student results',
    description: 'Review attempts and browser events',
  },
  {
    id: 'content-backup',
    icon: Archive,
    label: 'Content backup',
    description: 'Protect and restore instructional content',
  },
]
