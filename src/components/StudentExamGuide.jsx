import { useState } from 'react'
import {
  BookOpenCheck,
  CircleCheckBig,
  Clock3,
  History,
  Save,
  ShieldCheck,
  WifiOff,
} from 'lucide-react'
import AppIcon from './AppIcon'

const DISMISSED_KEY = 'ccna-student-exam-guide-dismissed:v1'

function readDismissed() {
  try {
    return window.localStorage.getItem(DISMISSED_KEY) === 'true'
  } catch {
    return false
  }
}

export default function StudentExamGuide({ standalone = false }) {
  const [open, setOpen] = useState(() => standalone || !readDismissed())

  function setGuideOpen(nextOpen) {
    setOpen(nextOpen)
    try {
      window.localStorage.setItem(DISMISSED_KEY, String(!nextOpen))
    } catch {
      // The guide remains usable when browser storage is restricted.
    }
  }

  return (
    <section className="student-exam-guide" aria-labelledby="student-exam-guide-title">
      <header className="student-exam-guide__header">
        <div className="student-exam-guide__identity">
          <span className="student-exam-guide__icon" aria-hidden="true">
            <AppIcon icon={BookOpenCheck} />
          </span>
          <div>
            <span className="eyebrow">STUDENT GUIDE</span>
            <h3 id="student-exam-guide-title">How to take an exam</h3>
            <p>Prepare, save your work, and submit with confidence.</p>
          </div>
        </div>
        <button
          className="secondary student-exam-guide__toggle"
          type="button"
          aria-expanded={open}
          aria-controls="student-exam-guide-content"
          onClick={() => setGuideOpen(!open)}
        >
          {open ? 'Hide guide' : 'View guide'}
        </button>
      </header>

      {open && (
        <div id="student-exam-guide-content" className="student-exam-guide__content">
          <ol className="student-exam-guide__steps">
            <li>
              <AppIcon icon={ShieldCheck} />
              <span><strong>Get ready.</strong> Use your assigned account, a charged device, and a supported browser.</span>
            </li>
            <li>
              <AppIcon icon={Clock3} />
              <span><strong>Start only when ready.</strong> The server timer continues even if the page is hidden or your connection drops.</span>
            </li>
            <li>
              <AppIcon icon={Save} />
              <span><strong>Watch the save status.</strong> Quiz answers and practical progress are saved locally first, then synchronized.</span>
            </li>
            <li>
              <AppIcon icon={WifiOff} />
              <span><strong>If internet is interrupted.</strong> Keep this browser open and continue the active attempt. Reconnect before final submission.</span>
            </li>
            <li>
              <AppIcon icon={History} />
              <span><strong>Finish and review.</strong> Submit once, wait for confirmation, then open History to view the recorded result.</span>
            </li>
          </ol>
          <div className="student-exam-guide__note">
            <AppIcon icon={CircleCheckBig} />
            <span>Starting a new attempt and final grading require an internet connection. Never clear browser data during an active exam.</span>
          </div>
        </div>
      )}
    </section>
  )
}
