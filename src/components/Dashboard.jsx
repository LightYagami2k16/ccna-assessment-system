import { lazy, Suspense } from 'react';
import { supabase } from '../lib/supabase';

import WorkspaceLoading from './WorkspaceLoading';

const InstructorWorkspace = lazy(() => import('./InstructorWorkspace'));
const StudentQuizArea = lazy(() => import('./StudentQuizArea'));

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
  user,
  previewMode = false
}) {
  const role = profile?.role ?? 'student';
  const displayName =
    profile?.full_name ||
    user?.email ||
    'CCNA user';

  const isInstructor = [
    'instructor',
    'administrator',
    'admin'
  ].includes(role);

  const isStudent = role === 'student';

  async function handleSignOut() {
    if (previewMode) {
      window.location.assign(
        `${window.location.pathname}${window.location.hash}`
      );
      return;
    }

    const { error } =
      await supabase.auth.signOut();

    if (error) {
      window.alert(error.message);
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar__brand">
          <span className="brand-mark" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>

          <span className="topbar__brand-copy">
            <strong>CCNA Assessment System</strong>
            <small>Networking learning and examinations</small>
          </span>
        </div>

        <div className="topbar__actions">
          <span className="topbar__user">
            <span>
              <strong>{displayName}</strong>
              {profile?.full_name && (
                <small>{user?.email}</small>
              )}
            </span>

            <span className="role-badge">
              {role}
            </span>
          </span>

          <button
            className="topbar__sign-out"
            type="button"
            onClick={handleSignOut}
          >
            {previewMode ? 'Exit preview' : 'Sign out'}
          </button>
        </div>
      </header>

      <main className="dashboard">
        <section className="welcome">
          <div>
            <span className="eyebrow">
              {isInstructor
                ? 'INSTRUCTOR PORTAL'
                : 'STUDENT PORTAL'}
            </span>

            <h1>
              Welcome back, {displayName}
            </h1>

            <p>
              {isInstructor
                ? 'Build quizzes and Cisco CLI practical examinations.'
                : 'Complete assigned quizzes and Cisco CLI practicals.'}
            </p>
          </div>

          <div className="welcome__context">
            <span>
              {isInstructor
                ? 'Instructor workspace'
                : 'Student workspace'}
            </span>

            <strong>
              {isInstructor
                ? 'Manage learning and assessments'
                : 'Continue your assigned learning'}
            </strong>
          </div>
        </section>

        <section className="dashboard-section">
          <div className="dashboard-section__heading">
            <div>
              <span className="eyebrow">
                COURSE CATALOG
              </span>
              <h2>CCNA courses</h2>
              <p>
                Content and assessments are organized across
                the three CCNA curriculum areas.
              </p>
            </div>

            <span className="status-chip">
              {courses.length} courses
            </span>
          </div>

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
            <Suspense
              fallback={
                <WorkspaceLoading label="Loading instructor tools..." />
              }
            >
              <InstructorWorkspace user={user} />
            </Suspense>
          </section>
        )}

        {isStudent && (
          <section className="dashboard-role-content">
            <Suspense
              fallback={
                <WorkspaceLoading label="Loading student assessments..." />
              }
            >
              <StudentQuizArea user={user} />
            </Suspense>
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
