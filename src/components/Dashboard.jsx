import { supabase } from '../lib/supabase';

import InstructorWorkspace from './InstructorWorkspace';
import StudentQuizArea from './StudentQuizArea';

const courses = [
  {
    code: 'ITN',
    title: 'Introduction to Networks',
    note:
      'Foundations, addressing, Ethernet, and basic configuration'
  },
  {
    code: 'SRWE',
    title:
      'Switching, Routing, and Wireless Essentials',
    note:
      'VLANs, STP, EtherChannel, WLANs, and routing'
  },
  {
    code: 'ENSA',
    title:
      'Enterprise Networking, Security, and Automation',
    note:
      'OSPF, ACLs, NAT, security, and automation'
  }
];

export default function Dashboard({
  profile,
  user
}) {
  const role = profile?.role ?? 'student';

  const isInstructor = [
    'instructor',
    'administrator',
    'admin'
  ].includes(role);

  const isStudent = role === 'student';

  async function handleSignOut() {
    const { error } =
      await supabase.auth.signOut();

    if (error) {
      window.alert(error.message);
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <strong>CCNA Assessment</strong>

          <span className="role-badge">
            {role}
          </span>
        </div>

        <button
          className="secondary"
          type="button"
          onClick={handleSignOut}
        >
          Sign out
        </button>
      </header>

      <main className="dashboard">
        <section className="welcome">
          <div>
            <span className="eyebrow">
              PHASE 1
            </span>

            <h1>
              Welcome,{' '}
              {profile?.full_name ||
                user?.email ||
                'User'}
            </h1>

            <p>
              {isInstructor
                ? 'Build question banks and review class results.'
                : 'Your assigned quizzes will appear here.'}
            </p>
          </div>

          <div className="metric">
            <strong>0</strong>

            <span>
              {isInstructor
                ? 'Published exams'
                : 'Completed exams'}
            </span>
          </div>
        </section>

        <section>
          <h2>CCNA courses</h2>

          <div className="course-grid">
            {courses.map((course) => (
              <article
                className="course-card"
                key={course.code}
              >
                <span className="course-code">
                  {course.code}
                </span>

                <h3>{course.title}</h3>

                <p>{course.note}</p>

                <button
                  className="secondary"
                  type="button"
                  disabled
                >
                  {isInstructor
                    ? 'Manage course (next step)'
                    : 'View course'}
                </button>
              </article>
            ))}
          </div>
        </section>

        {isInstructor && user && (
          <section className="dashboard-role-content">
            <InstructorWorkspace
              user={user}
            />
          </section>
        )}

        {isStudent && (
          <section className="dashboard-role-content">
            <StudentQuizArea />
          </section>
        )}

        {!isInstructor && !isStudent && (
          <section className="empty-state">
            <h2>Unknown account role</h2>

            <p>
              The profile role "{role}" is not currently
              supported.
            </p>
          </section>
        )}
      </main>
    </div>
  );
}
