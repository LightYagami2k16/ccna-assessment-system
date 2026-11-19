import {ResponsiveGrid} from './LayoutPrimitives'
import {criterionTypes,criterionTypeLabels,criterionSummary,criterionHelp,targetNotRequired,expectedNotRequired} from '../../supabase/functions/_shared/cliPracticalConfiguration.js'
import {criterionTypesForDevice} from '../services/cliCriterionApplicability'

export default function CliPracticalConfigurationFields({lab,setLab,courses=[],modules=[],loadCourseModules,editor,duel=false,renderCriterionExtra}) {
  const {expandedCriterionIndex,setExpandedCriterionIndex,setDeviceEditorSelection,expandedCriterionDeviceIds,setExpandedCriterionDeviceIds,selectedPreset,setSelectedPreset,totalCriterionPoints,deviceEditorIndex,editorDevice,criterionDeviceFilter,criterionDeviceIndex,availablePresetOptions,criterionDeviceGroups,updateCriterion,changeCriterionType,addCriterion,duplicateCriterion,removeCriterion,addPreset,selectCriterionDevice,toggleCriterionDevice,addDevice,updateDevice,removeDevice,addTopologyLink,updateTopologyLink,removeTopologyLink}=editor
  return <>
            {!duel && <ResponsiveGrid min="15rem" className="form-grid form-grid--two">
              <label>
                Course
                <select
                  required
                  value={lab.courseId}
                  onChange={(event) => {
                    const courseId = event.target.value
                    setLab((current) => ({ ...current, courseId, moduleId: '' }))
                    void loadCourseModules(courseId)
                  }}
                >
                  <option value="">Select course</option>
                  {courses.map((course) => (
                    <option key={course.id} value={course.id}>{course.code} — {course.title}</option>
                  ))}
                </select>
              </label>
              <label>
                Module
                <select
                  value={lab.moduleId}
                  onChange={(event) =>
                    setLab((current) => ({ ...current, moduleId: event.target.value }))
                  }
                >
                  <option value="">All course modules</option>
                  {modules.map((module) => (
                    <option key={module.id} value={module.id}>{module.code} — {module.title}</option>
                  ))}
                </select>
              </label>
            </ResponsiveGrid>}

            <ResponsiveGrid min="15rem" className="form-grid form-grid--two">
              <label>
                {duel ? 'Duel title' : 'Practical title'}
                <input required value={lab.title} onChange={(event) =>
                  setLab((current) => ({ ...current, title: event.target.value }))
                } />
              </label>
              {!duel && <label>
                Status
                <select value={lab.status} onChange={(event) =>
                  setLab((current) => ({ ...current, status: event.target.value }))
                }>
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                </select>
              </label>}
            </ResponsiveGrid>

            <fieldset className="cli-topology-builder form-fieldset">
              <legend>Devices and topology</legend>
              <div className="cli-topology-builder__heading">
                <div>
                  <strong>{lab.devices.length} of 12 devices</strong>
                  <span>
                    Add up to 12 routers, switches, or PCs, then define their links.
                  </span>
                </div>
                <button
                  className="secondary"
                  type="button"
                  disabled={lab.devices.length >= 12}
                  onClick={addDevice}
                >
                  Add device
                </button>
              </div>

              <div className="cli-device-editor-workspace">
                <div className="cli-device-editor-navigation">
                  <label htmlFor="cli-device-to-edit">Device to edit
                    <select id="cli-device-to-edit" value={editorDevice?.id ?? ''} onChange={event => setDeviceEditorSelection(event.target.value)}>
                      {lab.devices.map((device, index) => <option key={device.id} value={device.id}>{index + 1}. {device.label.trim() || `Device ${index + 1}`}{index === 0 ? ' (Primary)' : ''}</option>)}
                    </select>
                  </label>
                  <div className="cli-device-editor-navigation__actions">
                    <button className="secondary" type="button" aria-label="Previous device" disabled={deviceEditorIndex === 0} onClick={() => setDeviceEditorSelection(lab.devices[deviceEditorIndex - 1].id)}>← Previous</button>
                    <button className="secondary" type="button" aria-label="Next device" disabled={deviceEditorIndex === lab.devices.length - 1} onClick={() => setDeviceEditorSelection(lab.devices[deviceEditorIndex + 1].id)}>Next →</button>
                  </div>
                </div>
                {lab.devices.map((device, index) => index === deviceEditorIndex && (
                  <article id="cli-device-editor" className="cli-device-editor-card" key={device.id}>
                    <header>
                      <div className="cli-device-editor-card__identity">
                        <strong>Device {index + 1} — {device.label.trim() || 'Unnamed device'}</strong>
                        {index === 0 && <span className="cli-device-editor-card__primary">Primary device</span>}
                      </div>
                      <button
                        className="danger-button"
                        type="button"
                        disabled={lab.devices.length === 1}
                        onClick={() => removeDevice(index)}
                      >
                        Remove device
                      </button>
                    </header>
                    <div className="cli-device-editor-fields">
                      <label>
                        <span>
                          Display label <span className="required-mark">*</span>
                        </span>
                        <input
                          required={lab.status === 'published'}
                          aria-required="true"
                          placeholder="Example: Access Switch"
                          value={device.label}
                          onChange={(event) =>
                            updateDevice(index, 'label', event.target.value)}
                        />
                      </label>
                      <label>
                        <span>
                          Starting hostname <span className="required-mark">*</span>
                        </span>
                        <input
                          required={lab.status === 'published'}
                          aria-required="true"
                          placeholder="Example: SW1"
                          value={device.hostname}
                          onChange={(event) =>
                            updateDevice(index, 'hostname', event.target.value)}
                        />
                      </label>
                      <label>
                        Device type
                        <select
                          value={device.type}
                          onChange={(event) =>
                            updateDevice(index, 'type', event.target.value)}
                        >
                          <option value="switch">Cisco switch</option>
                          <option value="router">Cisco router</option>
                          <option value="pc">PC / end device</option>
                        </select>
                      </label>
                    </div>
                    <details className="cli-device-technical">
                      <summary>Technical details</summary>
                      <div>
                        <span>Internal device ID</span>
                        <code>{device.id}</code>
                      </div>
                    </details>
                  </article>
                ))}
              </div>

              <div className="cli-topology-links">
                <div className="cli-topology-builder__heading">
                  <div>
                    <strong>Physical links</strong>
                    <span>
                      Links document how device interfaces are connected.
                    </span>
                  </div>
                  <button
                    className="secondary"
                    type="button"
                    disabled={lab.devices.length < 2}
                    onClick={addTopologyLink}
                  >
                    Add link
                  </button>
                </div>
                {(lab.topology?.links ?? []).map((link, index) => (
                  <div className="cli-topology-link-row" key={link.id ?? index}>
                    <select
                      value={link.fromDeviceId}
                      onChange={(event) =>
                        updateTopologyLink(
                          index,
                          'fromDeviceId',
                          event.target.value,
                        )}
                    >
                      {lab.devices.map((device, deviceIndex) => (
                        <option key={device.id} value={device.id}>
                          {deviceIndex + 1}. {device.label.trim() || `Device ${deviceIndex + 1}`}
                        </option>
                      ))}
                    </select>
                    <input
                      aria-label="First interface"
                      value={link.fromInterface}
                      onChange={(event) =>
                        updateTopologyLink(
                          index,
                          'fromInterface',
                          event.target.value,
                        )}
                    />
                    <span aria-hidden="true">↔</span>
                    <select
                      value={link.toDeviceId}
                      onChange={(event) =>
                        updateTopologyLink(
                          index,
                          'toDeviceId',
                          event.target.value,
                        )}
                    >
                      {lab.devices.map((device, deviceIndex) => (
                        <option key={device.id} value={device.id}>
                          {deviceIndex + 1}. {device.label.trim() || `Device ${deviceIndex + 1}`}
                        </option>
                      ))}
                    </select>
                    <input
                      aria-label="Second interface"
                      value={link.toInterface}
                      onChange={(event) =>
                        updateTopologyLink(
                          index,
                          'toInterface',
                          event.target.value,
                        )}
                    />
                    <button
                      className="danger-button"
                      type="button"
                      onClick={() => removeTopologyLink(index)}
                    >
                      Remove
                    </button>
                  </div>
                ))}
                {!(lab.topology?.links ?? []).length && (
                  <p className="empty-state cli-topology-empty">
                    No physical links defined yet.
                  </p>
                )}
              </div>
            </fieldset>

            <label>
              Description
              <input value={lab.description} onChange={(event) =>
                setLab((current) => ({ ...current, description: event.target.value }))
              } />
            </label>
            <label>
              Student instructions
              <textarea required rows="5" value={lab.instructions} onChange={(event) =>
                setLab((current) => ({ ...current, instructions: event.target.value }))
              } />
            </label>

            <ResponsiveGrid min="14rem" className="form-grid form-grid--three">
              <label>Duration (minutes)<input type="number" min="1" max="480" value={lab.durationMinutes}
                onChange={(event) => setLab((current) => ({ ...current, durationMinutes: event.target.value }))} /></label>
              {!duel && <label>Maximum attempts<input type="number" min="1" max="100" value={lab.maxAttempts}
                onChange={(event) => setLab((current) => ({ ...current, maxAttempts: event.target.value }))} /></label>}
              {!duel && <label>Passing score (%)<input type="number" min="0" max="100" value={lab.passingScore}
                onChange={(event) => setLab((current) => ({ ...current, passingScore: event.target.value }))} /></label>}
            </ResponsiveGrid>

            <fieldset className="cli-criteria-editor form-fieldset">
              <legend>Grading criteria</legend>
              <div className="cli-criteria-overview">
                <div>
                  <strong>{lab.criteria.length} {lab.criteria.length === 1 ? 'requirement' : 'requirements'}</strong>
                  <span>
                    Expand one requirement at a time to edit its details.
                  </span>
                </div>
                <div className="cli-criteria-total">
                  <span>Total</span>
                  <strong>{totalCriterionPoints} points</strong>
                </div>
              </div>

              <div className="cli-criteria-device-filter">
                <div className="cli-device-editor-navigation">
                  <label htmlFor="cli-criteria-device">Filter by device
                    <select id="cli-criteria-device" value={criterionDeviceFilter} onChange={event => selectCriterionDevice(event.target.value)}>
                      {lab.devices.map((device, index) => <option key={device.id} value={device.id}>{index + 1}. {device.label.trim() || `Device ${index + 1}`}{index === 0 ? ' (Primary)' : ''}</option>)}
                      <option value="all">All devices</option>
                    </select>
                  </label>
                  <div className="cli-device-editor-navigation__actions">
                    <button className="secondary" type="button" aria-label="Previous device" disabled={criterionDeviceIndex <= 0} onClick={() => selectCriterionDevice(lab.devices[criterionDeviceIndex - 1].id)}>← Previous</button>
                    <button className="secondary" type="button" aria-label="Next device" disabled={criterionDeviceIndex < 0 || criterionDeviceIndex >= lab.devices.length - 1} onClick={() => selectCriterionDevice(lab.devices[criterionDeviceIndex + 1].id)}>Next →</button>
                  </div>
                </div>
                {criterionDeviceFilter === 'all' && <small>Select one device to use Quick preset or the main Add criterion button.</small>}
              </div>

              <div className="cli-criteria-toolbar">
                <div className="cli-preset-control">
                  <label htmlFor="cli-criterion-preset">
                    Quick preset
                  </label>
                  <div>
                    <select
                      id="cli-criterion-preset"
                      value={availablePresetOptions.some(([value]) => value === selectedPreset) ? selectedPreset : ''}
                      disabled={criterionDeviceFilter === 'all'}
                      onChange={(event) =>
                        setSelectedPreset(event.target.value)
                      }
                    >
                      <option value="">Select a preset</option>
                      {availablePresetOptions.map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <button
                      className="secondary"
                      type="button"
                      disabled={criterionDeviceFilter === 'all' || !availablePresetOptions.some(([value]) => value === selectedPreset)}
                      onClick={addPreset}
                    >
                      Add preset
                    </button>
                  </div>
                </div>

                <div className="cli-criteria-toolbar__actions">
                  <button
                    className="secondary cli-answer-key-toggle"
                    type="button"
                    onClick={() => {
                      setExpandedCriterionIndex(null)
                      setExpandedCriterionDeviceIds([])
                    }}
                  >
                    Collapse all
                  </button>
                  <button
                    className="primary"
                    type="button"
                    disabled={criterionDeviceFilter === 'all'}
                    onClick={() => addCriterion()}
                  >
                    Add criterion
                  </button>
                </div>
              </div>

              <div className="cli-criterion-list">
                {criterionDeviceGroups.filter(group => criterionDeviceFilter === 'all' || group.device.id === criterionDeviceFilter).map((group) => {
                  const deviceExpanded =
                    expandedCriterionDeviceIds.includes(group.device.id)
                  const devicePanelId =
                    `cli-device-criteria-${group.device.id}`

                  return (
                    <section
                      className={[
                        'cli-criterion-device-group',
                        deviceExpanded
                          ? 'cli-criterion-device-group--expanded'
                          : '',
                      ].filter(Boolean).join(' ')}
                      key={group.device.id}
                    >
                      <button
                        className="cli-criterion-device-header"
                        type="button"
                        aria-expanded={deviceExpanded}
                        aria-controls={devicePanelId}
                        onClick={() =>
                          toggleCriterionDevice(group.device.id)}
                      >
                        <span className="cli-criterion-device-icon">
                          {group.device.type === 'router'
                            ? 'R'
                            : group.device.type === 'pc' ? 'P' : 'S'}
                        </span>
                        <span className="cli-criterion-device-identity">
                          <strong>{group.label}</strong>
                          <small>
                            {group.device.hostname ? `${group.device.hostname} · ` : ''}
                            {group.device.type}
                          </small>
                        </span>
                        <span className="cli-criterion-device-metric">
                          <strong>{group.criteria.length}</strong>
                          <small>
                            {group.criteria.length === 1
                              ? 'criterion'
                              : 'criteria'}
                          </small>
                        </span>
                        <span className="cli-criterion-device-metric">
                          <strong>{group.points}</strong>
                          <small>points</small>
                        </span>
                        <span
                          className="cli-criterion-device-toggle"
                          aria-hidden="true"
                        >
                          {deviceExpanded ? '−' : '+'}
                        </span>
                      </button>

                      {deviceExpanded && (
                        <div
                          className="cli-criterion-device-body"
                          id={devicePanelId}
                        >
                          {criterionDeviceFilter === 'all' && <div className="cli-criterion-device-actions">
                            <span>
                              Requirements graded on {group.label}
                            </span>
                            <button
                              className="secondary"
                              type="button"
                              onClick={() =>
                                addCriterion(group.device.id)}
                            >
                              Add criterion
                            </button>
                          </div>}
                          {!group.criteria.length ? (
                            <div className="cli-criterion-device-empty">
                              <strong>No criteria for this device</strong>
                              <span>
                                Add a criterion to grade this device.
                              </span>
                            </div>
                          ) : group.criteria.map(
                            ({ criterion, index }, deviceIndex) => {
                  const expanded = expandedCriterionIndex === index
                  const panelId = `cli-criterion-panel-${index}`

                  return (
                    <article
                      className={[
                        'cli-criterion-card',
                        expanded ? 'cli-criterion-card--expanded' : '',
                      ].filter(Boolean).join(' ')}
                      key={index}
                    >
                      <button
                        className="cli-criterion-summary"
                        type="button"
                        aria-expanded={expanded}
                        aria-controls={panelId}
                        onClick={() =>
                          setExpandedCriterionIndex(
                            expanded ? null : index,
                          )
                        }
                      >
                        <span className="cli-criterion-summary__number">
                          {deviceIndex + 1}
                        </span>
                        <span className="cli-criterion-summary__content">
                          <strong>
                            {criterionTypeLabels[criterion.type]
                              ?? criterion.type}
                          </strong>
                          <small>{criterionSummary(criterion)}</small>
                        </span>
                        <span className="cli-criterion-summary__points">
                          {Number(criterion.points) || 0} pts
                        </span>
                        <span
                          className="cli-criterion-summary__toggle"
                          aria-hidden="true"
                        >
                          {expanded ? '−' : '+'}
                        </span>
                      </button>

                      {expanded && (
                        <div
                          className="cli-criterion-panel"
                          id={panelId}
                        >
                          <div className="cli-criterion-fields">
                            <label>
                              Requirement
                              <select
                                value={criterion.type}
                                onChange={(event) =>
                                  changeCriterionType(
                                    index,
                                    event.target.value,
                                  )
                                }
                              >
                                {criterionTypesForDevice(
                                  group.device.type,
                                  criterionTypes,
                                ).map(([value, label]) => (
                                  <option key={value} value={value}>
                                    {label}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label>
                              Target
                              <input
                                disabled={targetNotRequired.includes(
                                  criterion.type,
                                )}
                                value={criterion.target}
                                onChange={(event) =>
                                  updateCriterion(
                                    index,
                                    'target',
                                    event.target.value,
                                  )
                                }
                              />
                            </label>
                            <label>
                              Expected value
                              <input
                                disabled={expectedNotRequired.includes(
                                  criterion.type,
                                )}
                                value={criterion.expected}
                                onChange={(event) =>
                                  updateCriterion(
                                    index,
                                    'expected',
                                    event.target.value,
                                  )
                                }
                              />
                            </label>
                            <label>
                              Points
                              <input
                                type="number"
                                min="1"
                                value={criterion.points}
                                onChange={(event) =>
                                  updateCriterion(
                                    index,
                                    'points',
                                    event.target.value,
                                  )
                                }
                              />
                            </label>
                            {renderCriterionExtra?.(criterion,index)}
                          </div>

                          <div className="cli-criterion-panel__footer">
                            <small>{criterionHelp(criterion.type)}</small>
                            <div>
                              <button
                                className="secondary"
                                type="button"
                                onClick={() => duplicateCriterion(index)}
                              >
                                Duplicate
                              </button>
                              <button
                                className="danger-button"
                                type="button"
                                disabled={lab.criteria.length === 1}
                                onClick={() => removeCriterion(index)}
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </article>
                  )
                            },
                          )}
                        </div>
                      )}
                    </section>
                  )
                })}
              </div>
            </fieldset>

  </>
}
