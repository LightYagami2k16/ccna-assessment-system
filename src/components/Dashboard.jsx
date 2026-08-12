import { lazy, Suspense, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

import AccountSettings from './AccountSettings';
import BrandMark from './BrandMark';
import WorkspaceLoading from './WorkspaceLoading';

const InstructorWorkspace = lazy(() => import('./InstructorWorkspace'));
const StudentQuizArea = lazy(() => import('./StudentQuizArea'));
const AdminWorkspace = lazy(() => import('./AdminWorkspace'));

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
  previewMode = false,
  onProfileUpdated = () => {}
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [studentExamMode, setStudentExamMode] = useState(false);
  const settingsButtonRef = useRef(null);
  const role = profile?.role ?? 'student';
  const displayName =
    profile?.full_name ||
    user?.email ||
    'CCNA user';

  const isAdministrator = [
    'administrator',
    'admin'
  ].includes(role);

  const isInstructor = role === 'instructor';

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

  function closeSettings() {
    setSettingsOpen(false);
    window.requestAnimationFrame(() => {
      settingsButtonRef.current?.focus();
    });
  }

  return (
    <div
      className={
        studentExamMode
          ? 'app-shell app-shell--exam-mode'
          : 'app-shell'
      }
    >
      {!studentExamMode && (
        <a
          className="skip-to-content"
          href="#main-workspace-content"
          onClick={() => {
            window.requestAnimationFrame(() => {
              document
                .getElementById('main-workspace-content')
                ?.focus();
            });
          }}
        >
          Skip to main content
        </a>
      )}
      {!studentExamMode && (
      <header className="topbar">
        <div className="topbar__brand">
          <BrandMark />

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
            ref={settingsButtonRef}
            className="topbar__account-settings"
            type="button"
            aria-haspopup="dialog"
            aria-controls="account-settings-dialog"
            aria-expanded={settingsOpen}
            onClick={() => {
              if (settingsOpen) {
                closeSettings();
              } else {
                setSettingsOpen(true);
              }
            }}
          >
            {settingsOpen ? 'Close settings' : 'Account settings'}
          </button>

          <button
            className="topbar__sign-out"
            type="button"
            onClick={handleSignOut}
          >
            {previewMode ? 'Exit preview' : 'Sign out'}
          </button>
        </div>
      </header>
      )}

      <main
        id="main-workspace-content"
        tabIndex="-1"
        className={
          studentExamMode
            ? 'dashboard dashboard--exam-mode'
            : 'dashboard'
        }
      >
        {!studentExamMode && settingsOpen && (
          <AccountSettings
            user={user}
            profile={profile}
            previewMode={previewMode}
            onProfileUpdated={onProfileUpdated}
            onClose={closeSettings}
          />
        )}

        {!studentExamMode && (
        <section className="welcome">
          <div>
            <span className="eyebrow">
              {isInstructor
                ? 'INSTRUCTOR PORTAL'
                : isAdministrator
                  ? 'ADMINISTRATOR PORTAL'
                : 'STUDENT PORTAL'}
            </span>

            <h1>
              Welcome back, {displayName}
            </h1>

            <p>
              {isInstructor
                ? 'Build quizzes and Cisco CLI practical examinations.'
                : isAdministrator
                  ? 'Manage user access and oversee the assessment platform.'
                : 'Complete assigned quizzes and Cisco CLI practicals.'}
            </p>
          </div>

          <div className="welcome__context">
            <span>
              {isInstructor
                ? 'Instructor workspace'
                : isAdministrator
                  ? 'Administrator workspace'
                : 'Student workspace'}
            </span>

            <strong>
              {isInstructor
                ? 'Manage learning and assessments'
                : isAdministrator
                  ? 'Manage accounts and platform access'
                : 'Continue your assigned learning'}
            </strong>
          </div>
        </section>
        )}

        {isStudent && (
          <section
            className="dashboard-role-content dashboard-role-content--student"
            key="student-workspace"
          >
            <Suspense
              fallback={
                <WorkspaceLoading label="Loading student assessments..." />
              }
            >
              <StudentQuizArea
                user={user}
                onExamModeChange={setStudentExamMode}
              />
            </Suspense>
          </section>
        )}

        {!studentExamMode && !isAdministrator && (
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
        )}

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

        {isAdministrator && user && (
          <section className="dashboard-role-content">
            <Suspense
              fallback={
                <WorkspaceLoading label="Loading administrator tools..." />
              }
            >
              <AdminWorkspace
                user={user}
                previewMode={previewMode}
              />
            </Suspense>
          </section>
        )}

        {!isAdministrator && !isInstructor && !isStudent && (
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
