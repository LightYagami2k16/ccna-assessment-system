import { supabase } from '../lib/supabase'

const courses = [
  { code: 'ITN', title: 'Introduction to Networks', note: 'Foundations, addressing, Ethernet, and basic configuration' },
  { code: 'SRWE', title: 'Switching, Routing, and Wireless Essentials', note: 'VLANs, STP, EtherChannel, WLANs, and routing' },
  { code: 'ENSA', title: 'Enterprise Networking, Security, and Automation', note: 'OSPF, ACLs, NAT, security, and automation' },
]

export default function Dashboard({ profile, user }) {
  const isInstructor = ['instructor', 'admin'].includes(profile?.role)

  return (
    <div className="app-shell">
      <header className="topbar">
        <div><strong>CCNA Assessment</strong><span className="role-badge">{profile?.role || 'student'}</span></div>
        <button className="secondary" onClick={() => supabase.auth.signOut()}>Sign out</button>
      </header>

      <main className="dashboard">
        <section className="welcome">
          <div><span className="eyebrow">PHASE 1</span><h1>Welcome, {profile?.full_name || user.email}</h1><p>{isInstructor ? 'Build question banks and review class results.' : 'Your assigned quizzes will appear here.'}</p></div>
          <div className="metric"><strong>0</strong><span>{isInstructor ? 'Published exams' : 'Completed exams'}</span></div>
        </section>

        <h2>CCNA courses</h2>
        <section className="course-grid">
          {courses.map((course) => (
            <article className="course-card" key={course.code}>
              <span className="course-code">{course.code}</span>
              <h3>{course.title}</h3>
              <p>{course.note}</p>
              <button className="secondary" disabled>{isInstructor ? 'Manage course (next step)' : 'No assigned quiz yet'}</button>
            </article>
          ))}
        </section>
      </main>
    </div>
  )
}
