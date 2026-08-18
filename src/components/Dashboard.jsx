import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

import AccountSettings from './AccountSettings';
import BrandMark from './BrandMark';
import WorkspaceLoading from './WorkspaceLoading';
import {
  getWorkspaceRoute,
  normalizeWorkspaceRole,
  replaceWorkspacePath,
  workspaceDefaultPathForRole
} from '../routing/workspaceRoutes';

const InstructorWorkspace = lazy(() => import('./InstructorWorkspace'));
const StudentQuizArea = lazy(() => import('./StudentQuizArea'));
const AdminWorkspace = lazy(() => import('./AdminWorkspace'));

export default function Dashboard({
  profile,
  user,
  previewMode = false,
  onProfileUpdated = () => {}
}) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [studentExamMode, setStudentExamMode] = useState(false);
  const [routeNotice, setRouteNotice] = useState('');
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

  useEffect(() => {
    const normalizedRole = normalizeWorkspaceRole(role);

    function guardWorkspaceRoute() {
      const route = getWorkspaceRoute();
      if (!route?.role || route.role === normalizedRole) return;

      setRouteNotice(
        'That page is not available for your account. Your workspace home page is shown instead.'
      );
      replaceWorkspacePath(workspaceDefaultPathForRole(normalizedRole));
    }

    guardWorkspaceRoute();
    window.addEventListener('hashchange', guardWorkspaceRoute);
    return () => window.removeEventListener('hashchange', guardWorkspaceRoute);
  }, [role]);

  async function handleSignOut() {
    if (previewMode) {
      window.location.assign(window.location.pathname);
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

        {!studentExamMode && routeNotice && (
          <div className="form-message form-message--warning" role="status">
            <span>{routeNotice}</span>
            <button
              className="button-link"
              type="button"
              onClick={() => setRouteNotice('')}
            >
              Dismiss
            </button>
          </div>
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
