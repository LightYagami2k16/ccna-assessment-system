import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { Users } from 'lucide-react'
import useConfirmationDialog from '../hooks/useConfirmationDialog'
import LoadingState from './LoadingState'
import TailwindEmptyState from './TailwindEmptyState'
import { FilterBar } from './LayoutPrimitives'
import {
  deleteUserAccount,
  getUserAccounts,
  inviteUserAccount,
  sendUserPasswordReset,
  setUserSuspension,
  setUserAccountRole,
} from '../services/adminService'

const roleLabels = {
  student: 'Student',
  instructor: 'Instructor',
  administrator: 'Administrator',
}

const previewAccounts = [
  {
    id: 'uat-admin',
    email: 'admin@example.test',
    fullName: 'UAT Administrator',
    role: 'administrator',
    emailConfirmed: true,
    isSuspended: false,
    createdAt: new Date().toISOString(),
    lastSignInAt: new Date().toISOString(),
  },
  {
    id: 'uat-instructor',
    email: 'instructor@example.test',
    fullName: 'CCNA Instructor',
    role: 'instructor',
    emailConfirmed: true,
    isSuspended: false,
    createdAt: new Date().toISOString(),
    lastSignInAt: new Date().toISOString(),
  },
  {
    id: 'uat-student',
    email: 'student@example.test',
    fullName: 'CCNA Student',
    role: 'student',
    emailConfirmed: true,
    isSuspended: false,
    createdAt: new Date().toISOString(),
    lastSignInAt: null,
  },
]

function formatDate(value) {
  if (!value) return 'Never'

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

export default function AdminUserManagement({
  currentUser,
  previewMode = false,
}) {
  const [accounts, setAccounts] = useState([])
  const [selectedRoles, setSelectedRoles] = useState({})
  const [searchTerm, setSearchTerm] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [savingUserId, setSavingUserId] = useState(null)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteValues, setInviteValues] = useState({
    fullName: '',
    email: '',
    role: 'student',
  })
  const [inviting, setInviting] = useState(false)
  const [accountActions, setAccountActions] = useState({})
  const [message, setMessage] = useState('')
  const [messageTone, setMessageTone] = useState('success')
  const { confirm, confirmationDialog } = useConfirmationDialog()

  const loadAccounts = useCallback(async () => {
    try {
      setLoading(true)
      setMessage('')

      const nextAccounts = previewMode
        ? previewAccounts.map((account, index) =>
            index === 0
              ? { ...account, id: currentUser?.id ?? account.id }
              : account,
          )
        : await getUserAccounts()

      setAccounts(nextAccounts)
      setSelectedRoles(
        Object.fromEntries(
          nextAccounts.map((account) => [
            account.id,
            account.role,
          ]),
        ),
      )
    } catch (error) {
      setMessageTone('error')
      setMessage(
        error?.message ?? 'Unable to load user accounts.',
      )
    } finally {
      setLoading(false)
    }
  }, [currentUser?.id, previewMode])

  useEffect(() => {
    void loadAccounts()
  }, [loadAccounts])

  const accountCounts = useMemo(
    () => ({
      all: accounts.length,
      student: accounts.filter(
        (account) => account.role === 'student',
      ).length,
      instructor: accounts.filter(
        (account) => account.role === 'instructor',
      ).length,
      administrator: accounts.filter(
        (account) => account.role === 'administrator',
      ).length,
    }),
    [accounts],
  )

  const visibleAccounts = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase()

    return accounts.filter((account) => {
      const matchesRole =
        roleFilter === 'all' || account.role === roleFilter
      const matchesSearch =
        !normalizedSearch ||
        account.fullName.toLowerCase().includes(normalizedSearch) ||
        account.email.toLowerCase().includes(normalizedSearch)

      return matchesRole && matchesSearch
    })
  }, [accounts, roleFilter, searchTerm])

  async function handleApplyRole(account) {
    const nextRole = selectedRoles[account.id]

    if (!nextRole || nextRole === account.role) return

    const confirmed = await confirm({
      title: 'Change account role?',
      message: `${account.fullName || account.email} will receive ${roleLabels[nextRole]} access. Their workspace will change the next time their profile is loaded.`,
      confirmLabel: 'Change role',
      tone: 'primary',
    })

    if (!confirmed) return

    try {
      setSavingUserId(account.id)
      setMessage('')

      if (!previewMode) {
        await setUserAccountRole({
          userId: account.id,
          role: nextRole,
        })
      }

      setAccounts((currentAccounts) =>
        currentAccounts.map((currentAccount) =>
          currentAccount.id === account.id
            ? { ...currentAccount, role: nextRole }
            : currentAccount,
        ),
      )
      setMessageTone('success')
      setMessage(
        `${account.fullName || account.email} is now a ${roleLabels[nextRole].toLowerCase()}.`,
      )
    } catch (error) {
      setSelectedRoles((currentRoles) => ({
        ...currentRoles,
        [account.id]: account.role,
      }))
      setMessageTone('error')
      setMessage(
        error?.message ?? 'Unable to change the account role.',
      )
    } finally {
      setSavingUserId(null)
    }
  }

  async function handleInvite(event) {
    event.preventDefault()

    try {
      setInviting(true)
      setMessage('')

      if (!previewMode) {
        await inviteUserAccount(inviteValues)
      }

      const invitedEmail = inviteValues.email.trim().toLowerCase()
      setInviteValues({
        fullName: '',
        email: '',
        role: 'student',
      })
      setInviteOpen(false)
      await loadAccounts()
      setMessageTone('success')
      setMessage(`Invitation sent to ${invitedEmail}.`)
    } catch (error) {
      setMessageTone('error')
      setMessage(error?.message ?? 'Unable to send the invitation.')
    } finally {
      setInviting(false)
    }
  }

  async function handleAccountAction(account) {
    const action = accountActions[account.id]
    if (!action) return

    const deleting = action === 'delete'
    const suspending = action === 'suspend'
    const sendingPasswordReset =
      action === 'send_password_reset'
    const confirmed = await confirm({
      title: deleting
        ? 'Permanently delete this account?'
        : sendingPasswordReset
          ? 'Send password reset instructions?'
        : suspending
          ? 'Suspend this account?'
          : 'Reactivate this account?',
      message: deleting
        ? `${account.fullName || account.email} will lose access permanently. Their profile, enrollments, attempts, and other account-linked records may also be deleted. This action cannot be undone.`
        : sendingPasswordReset
          ? `Supabase will email a secure password recovery link to ${account.email}. The existing password remains valid until the user completes the reset.`
        : suspending
          ? `${account.fullName || account.email} will be unable to sign in until an administrator reactivates the account.`
          : `${account.fullName || account.email} will be able to sign in again.`,
      confirmLabel: deleting
        ? 'Delete account'
        : sendingPasswordReset
          ? 'Send reset email'
        : suspending
          ? 'Suspend account'
          : 'Reactivate account',
      tone: deleting || suspending ? 'danger' : 'primary',
    })

    if (!confirmed) return

    try {
      setSavingUserId(account.id)
      setMessage('')

      if (!previewMode) {
        if (deleting) {
          await deleteUserAccount(account.id)
        } else if (sendingPasswordReset) {
          await sendUserPasswordReset(account.id)
        } else {
          await setUserSuspension({
            userId: account.id,
            suspended: suspending,
          })
        }
      }

      setAccounts((currentAccounts) =>
        deleting
          ? currentAccounts.filter(
              (currentAccount) => currentAccount.id !== account.id,
            )
          : sendingPasswordReset
            ? currentAccounts
          : currentAccounts.map((currentAccount) =>
              currentAccount.id === account.id
                ? { ...currentAccount, isSuspended: suspending }
                : currentAccount,
            ),
      )
      setSelectedRoles((current) => {
        const next = { ...current }
        if (deleting) delete next[account.id]
        return next
      })
      setAccountActions((current) => ({
        ...current,
        [account.id]: '',
      }))
      setMessageTone('success')
      setMessage(
        deleting
          ? `${account.fullName || account.email} was permanently deleted.`
          : sendingPasswordReset
            ? `Password reset instructions were sent to ${account.email}.`
          : suspending
            ? `${account.fullName || account.email} was suspended.`
            : `${account.fullName || account.email} was reactivated.`,
      )
    } catch (error) {
      setMessageTone('error')
      setMessage(
        error?.message ?? 'Unable to update account access.',
      )
    } finally {
      setSavingUserId(null)
    }
  }

  return (
    <section className="admin-users-panel">
      <header className="section-heading admin-users-heading">
        <div>
          <span className="eyebrow">USER ADMINISTRATION</span>
          <h2>Account directory</h2>
          <p>
            Review registered accounts and control access to
            student, instructor, and administrator workspaces.
          </p>
        </div>

        <div className="admin-users-heading__actions">
          <button
            className="secondary"
            type="button"
            disabled={loading}
            onClick={() => void loadAccounts()}
          >
            {loading ? 'Refreshing...' : 'Refresh accounts'}
          </button>
          <button
            className="primary"
            type="button"
            aria-expanded={inviteOpen}
            onClick={() => {
              setInviteValues({
                fullName: '',
                email: '',
                role: 'student',
              })
              setInviteOpen((current) => !current)
            }}
          >
            {inviteOpen ? 'Close invitation' : 'Invite user'}
          </button>
        </div>
      </header>

      {inviteOpen && (
        <form
          className="admin-invite-form"
          onSubmit={(event) => void handleInvite(event)}
        >
          <div>
            <span className="eyebrow">NEW ACCOUNT</span>
            <h3>Invite a user</h3>
            <p>
              Supabase will email a secure account invitation. No
              password is created or displayed in the browser.
            </p>
          </div>

          <div className="admin-invite-fields">
            <label>
              Full name
              <input
                value={inviteValues.fullName}
                required
                onChange={(event) =>
                  setInviteValues((current) => ({
                    ...current,
                    fullName: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              Email address
              <input
                type="email"
                value={inviteValues.email}
                required
                onChange={(event) =>
                  setInviteValues((current) => ({
                    ...current,
                    email: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              Initial role
              <select
                value={inviteValues.role}
                onChange={(event) =>
                  setInviteValues((current) => ({
                    ...current,
                    role: event.target.value,
                  }))
                }
              >
                <option value="student">Student</option>
                <option value="instructor">Instructor</option>
                <option value="administrator">Administrator</option>
              </select>
            </label>
          </div>

          <div className="admin-invite-actions">
            <button
              className="primary"
              type="submit"
              disabled={inviting}
            >
              {inviting ? 'Sending invitation...' : 'Send invitation'}
            </button>
            <button
              className="secondary"
              type="button"
              onClick={() => setInviteOpen(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="admin-user-metrics" aria-label="Account totals">
        {[
          ['all', 'Total accounts'],
          ['student', 'Students'],
          ['instructor', 'Instructors'],
          ['administrator', 'Administrators'],
        ].map(([key, label]) => (
          <article key={key}>
            <span>{label}</span>
            <strong>{accountCounts[key]}</strong>
          </article>
        ))}
      </div>

      <FilterBar className="admin-user-filters" aria-label="Account filters">
        <label>
          Search accounts
          <input
            type="search"
            value={searchTerm}
            placeholder="Name or email address"
            onChange={(event) => setSearchTerm(event.target.value)}
          />
        </label>

        <label>
          Account role
          <select
            value={roleFilter}
            onChange={(event) => setRoleFilter(event.target.value)}
          >
            <option value="all">All roles</option>
            <option value="student">Students</option>
            <option value="instructor">Instructors</option>
            <option value="administrator">Administrators</option>
          </select>
        </label>
      </FilterBar>

      {message && (
        <p
          className={
            messageTone === 'error'
              ? 'form-message form-message--error'
              : 'form-message form-message--success'
          }
          role="status"
        >
          {message}
        </p>
      )}

      {loading ? (
        <LoadingState label="Loading accounts..." />
      ) : visibleAccounts.length === 0 ? (
        <TailwindEmptyState
          icon={Users}
          title="No matching accounts"
          description="Try a different name, email, or role filter."
        />
      ) : (
        <div className="admin-user-list">
          {visibleAccounts.map((account) => {
            const isCurrentAccount =
              account.id === currentUser?.id
            const selectedRole =
              selectedRoles[account.id] ?? account.role
            const roleChanged = selectedRole !== account.role

            return (
              <article className="admin-user-card" key={account.id}>
                <div className="admin-user-card__identity">
                  <span className="admin-user-avatar" aria-hidden="true">
                    {(account.fullName || account.email)
                      .charAt(0)
                      .toUpperCase()}
                  </span>

                  <span>
                    <strong>
                      {account.fullName || 'Unnamed account'}
                    </strong>
                    <small>{account.email}</small>
                  </span>
                </div>

                <dl className="admin-user-card__details">
                  <div>
                    <dt>Email status</dt>
                    <dd>
                      {account.emailConfirmed
                        ? 'Confirmed'
                        : 'Not confirmed'}
                    </dd>
                  </div>
                  <div>
                    <dt>Last sign in</dt>
                    <dd>{formatDate(account.lastSignInAt)}</dd>
                  </div>
                  <div>
                    <dt>Registered</dt>
                    <dd>{formatDate(account.createdAt)}</dd>
                  </div>
                  <div>
                    <dt>Account access</dt>
                    <dd>
                      <span
                        className={
                          account.isSuspended
                            ? 'account-status account-status--suspended'
                            : 'account-status account-status--active'
                        }
                      >
                        {account.isSuspended ? 'Suspended' : 'Active'}
                      </span>
                    </dd>
                  </div>
                </dl>

                <div className="admin-user-card__controls">
                  <div className="admin-user-card__role">
                  <label>
                    Workspace role
                    <select
                      value={selectedRole}
                      disabled={isCurrentAccount}
                      onChange={(event) =>
                        setSelectedRoles((currentRoles) => ({
                          ...currentRoles,
                          [account.id]: event.target.value,
                        }))
                      }
                    >
                      <option value="student">Student</option>
                      <option value="instructor">Instructor</option>
                      <option value="administrator">
                        Administrator
                      </option>
                    </select>
                  </label>

                  <button
                    className="primary"
                    type="button"
                    disabled={
                      isCurrentAccount ||
                      !roleChanged ||
                      savingUserId === account.id
                    }
                    onClick={() => void handleApplyRole(account)}
                  >
                    {savingUserId === account.id
                      ? 'Saving...'
                      : isCurrentAccount
                        ? 'Current account'
                        : 'Apply role'}
                  </button>
                  </div>

                  <div className="admin-user-card__security">
                    <label>
                      Account action
                      <select
                        value={accountActions[account.id] ?? ''}
                        disabled={isCurrentAccount}
                        onChange={(event) =>
                          setAccountActions((current) => ({
                            ...current,
                            [account.id]: event.target.value,
                          }))
                        }
                      >
                        <option value="">Select an action</option>
                        <option value="send_password_reset">
                          Send password reset
                        </option>
                        {account.isSuspended ? (
                          <option value="reactivate">Reactivate</option>
                        ) : (
                          <option value="suspend">Suspend</option>
                        )}
                        <option value="delete">Delete permanently</option>
                      </select>
                    </label>
                    <button
                      className={
                        ['suspend', 'delete'].includes(
                          accountActions[account.id],
                        )
                          ? 'danger-button'
                          : 'secondary'
                      }
                      type="button"
                      disabled={
                        isCurrentAccount ||
                        !accountActions[account.id] ||
                        savingUserId === account.id
                      }
                      onClick={() => void handleAccountAction(account)}
                    >
                      OK
                    </button>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}

      <aside className="admin-security-note">
        <strong>Secure account provisioning</strong>
        <p>
          New registrations always start as students. Only an
          administrator can promote an existing registered account.
          Your own administrator role cannot be changed or deleted
          here. The last administrator account is also protected.
        </p>
      </aside>

      {confirmationDialog}
    </section>
  )
}
