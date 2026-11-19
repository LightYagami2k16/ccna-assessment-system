import { useCallback, useEffect, useRef, useState } from 'react'
import useCliDuel from '../hooks/useCliDuel'
import useCliDuelOperationQueue from '../hooks/useCliDuelOperationQueue'
import useAssessmentFocusMode from '../hooks/useAssessmentFocusMode'
import useAssessmentClientSession from '../hooks/useAssessmentClientSession'
import { getDuelPlayer, sendDuelAction, finishDuel, settleDuel, setDuelArenaPresence, selectDuelCharacter, duelError } from '../services/cliDuelService'
import './CliDuel.css'
import CliDuelOverlay from './CliDuelOverlay'
import CliDuelHealthBar from './CliDuelHealthBar'
import CliDuelStage,{DuelFullscreenButton} from './CliDuelStage'
import CliDuelWaitingRoom from './CliDuelWaitingRoom'
import CliDuelCharacter from './CliDuelCharacter'
import CliDuelCharacterDialog from './CliDuelCharacterDialog'
import CliDuelVersus from './CliDuelVersus'
import {getDuelIntroPhase} from '../services/cliDuelCharacters'
import {getDuelWinners} from '../services/cliDuelWinners'
import CliDuelDeviceConsole from './CliDuelDeviceConsole'
import {fullOperationCommand} from '../../supabase/functions/_shared/cliDuelFullProtocol.js'
import { getDevicePrompt } from '../simulator/ciscoSimulator'

export default function CliDuelArena({ participantId, onExit }) {
  useAssessmentFocusMode()
  const [locked, setLocked] = useState(false)
  const lease = useAssessmentClientSession({ assessmentType: 'competition', attemptId: participantId, enabled: !locked })
  const loader = useCallback(() => getDuelPlayer(participantId, lease.clientId), [participantId, lease.clientId])
  const { data, error, fresh, refresh, adopt, getSnapshot } = useCliDuel(loader,undefined,1000)
  const [command, setCommand] = useState('')
  const [pending, setPending] = useState(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [unsent,setUnsent]=useState([])
  const showFinishConfirmation=useCallback(()=>setConfirmFinish(true),[])
  const [clock, setClock] = useState(Date.now())
  const [offset, setOffset] = useState(0)
  const [confirmFinish, setConfirmFinish] = useState(false)
  const [outcomeDismissed,setOutcomeDismissed]=useState(false)
  const [selectingCharacter,setSelectingCharacter]=useState(false)
  const inFlight = useRef(false)
  const settled = useRef(false)
  const match = data?.competition
  const own = data?.ownParticipant
  useEffect(()=>{if(match?.status!=='waiting')setSelectingCharacter(false)},[match?.status])
  const introPhase=getDuelIntroPhase(match)
  async function confirmCharacter(character){setBusy(true);setMessage('');try{await selectDuelCharacter(participantId,lease.clientId,character);await refresh();setSelectingCharacter(false)}finally{setBusy(false)}}
  const showBattle=Boolean(!match?.hostControlled||match?.hasStarted||['active','paused','completed','voided'].includes(match?.status))
  const winners=getDuelWinners(match,data?.participants),won=winners.some(player=>player.id===own?.id),draw=won&&winners.length>1
  const spectator=Boolean(match?.hostControlled&&own?.status==='submitted'&&!['completed','cancelled','voided'].includes(match?.status))
  const admitting=Boolean(match?.hostControlled?['waiting','countdown','active','paused'].includes(match?.status):match?.arenaEntryRequired&&['waiting','countdown'].includes(match?.status))
  useEffect(()=>{
    if(!admitting||(!spectator&&lease.status!=='active')||lease.connectionStatus!=='online')return undefined
    let cancelled=false,inProgress=false
    async function present(){if(inProgress)return;inProgress=true;try{await setDuelArenaPresence(participantId,lease.clientId,navigator.onLine&&document.visibilityState!=='hidden');if(cancelled)await setDuelArenaPresence(participantId,lease.clientId,false);else void refresh()}catch(failure){if(!cancelled)setMessage(duelError(failure))}finally{inProgress=false}}
    void present();const timer=window.setInterval(present,match?.hostControlled?750:1500);document.addEventListener('visibilitychange',present)
    return()=>{cancelled=true;window.clearInterval(timer);document.removeEventListener('visibilitychange',present);void setDuelArenaPresence(participantId,lease.clientId,false).catch(()=>{})}
  },[admitting,participantId,lease.clientId,lease.status,lease.connectionStatus,refresh,match?.hostControlled,spectator])
  const terminal=['completed','cancelled','voided'].includes(match?.status)
  useEffect(() => { if (own) setLocked(terminal || own.status !== 'in_progress'); if(terminal||match?.status!=='active')setConfirmFinish(false) }, [own,terminal,match?.status])
  useEffect(() => {
    if (pending && data?.ownCommands?.some(entry => entry.sequence === pending.sequence && entry.command === (pending.action === 'operation' ? fullOperationCommand(pending) : pending.command) && (pending.action !== 'operation' || entry.deviceId === pending.deviceId))) setPending(null)
  }, [pending, data?.ownCommands])
  useEffect(() => { if (data?.serverNow) setOffset(new Date(data.serverNow).getTime() - Date.now()) }, [data?.serverNow])
  useEffect(() => { if(terminal)return undefined; const timer = window.setInterval(() => setClock(Date.now()), 250); return () => window.clearInterval(timer) }, [terminal])
  const now = clock + offset
  const countdown = match?.startsAt ? Math.max(0, Math.ceil((new Date(match.startsAt).getTime() - now) / 1000)) : 0
  const seconds = match?.deadline ? Math.max(0, Math.ceil((new Date(match.deadline).getTime() - now) / 1000)) : 0
  const pausedSeconds=Math.ceil((match?.remainingMs||0)/1000)
  const expired = Boolean(match?.deadline) && seconds === 0
  useEffect(() => {
    if (expired && match && !terminal && !settled.current) {
      settled.current = true
      void settleDuel(match.id).then(refresh).catch(() => { settled.current = false })
    }
  }, [expired, match, terminal, refresh])
  const inputAllowed = Boolean(!terminal && fresh && data?.ownState && own?.id===participantId && own?.status === 'in_progress' && lease.status === 'active' && lease.connectionStatus === 'online' && match?.status==='active' && !expired && !countdown && !busy)
  const enabled=inputAllowed&&!pending
  const queued=useCliDuelOperationQueue({participantId,clientId:lease.clientId,data,allowed:inputAllowed&&match?.rulesVersion===3,
    onAccepted:result=>{setMessage('');adopt(result);const current=getSnapshot();return current?.ownParticipant?.id===participantId&&current?.competition?.id===result.competition?.id&&Number(current.revision)>=Number(result.revision)?current:false},
    onError:({error,uncertain})=>{setMessage(`${duelError(error)} ${uncertain?'Retry the same command before continuing.':'Review the saved commands below.'}`);void refresh()},
    onDiscard:items=>{setUnsent(previous=>[...previous,...items].slice(-40));setMessage('Some buffered commands need review. Their text is kept below.')},
  })
  const enqueueCommand=queued.enqueue
  const enqueueOperation=useCallback((deviceId,operation)=>{const accepted=enqueueCommand(deviceId,operation);setMessage(accepted?'':'Wait for pending commands to synchronize before sending more.');return accepted},[enqueueCommand])
  async function send(payload) {
    if (inFlight.current) return
    inFlight.current = true; setBusy(true); setMessage('')
    try {
      await sendDuelAction(payload)
      setPending(null); setCommand(''); await refresh();return true
    } catch (failure) {
      // Preserve the exact ID/body for an uncertain transport. Never award locally.
      setPending([400, 401, 403, 409].includes(failure.status) ? null : payload); setMessage(`${duelError(failure)} An uncertain command must be retried with the same ID before continuing.`)
      await refresh();return false
    } finally { inFlight.current = false; setBusy(false) }
  }
  function submit(event) {
    event.preventDefault()
    if (!enabled || !command.trim()) return
    const payload = { action: 'command', participantId, clientId: lease.clientId, commandId: crypto.randomUUID(), sequence: Number(data.revision) + 1, expectedRevision: Number(data.revision), command }
    setPending(payload); void send(payload)
  }
  async function finish() {
    if (inFlight.current || pending || queued.entries.length) return
    setBusy(true)
    try { await finishDuel(participantId, lease.clientId); setConfirmFinish(false); await refresh() } catch (failure) { setMessage(duelError(failure)) } finally { setBusy(false) }
  }
  return <CliDuelStage><section className="panel cli-duel duel-arena cli-practical-shell">
    <header className="duel-heading cli-practical-header"><div><span className="eyebrow">CLI DUEL ARENA</span><h2>{match?.title || 'Connecting to duel'}</h2><p>{match?.rulesVersion>=2 ? 'Zero HP ends the duel · New objectives deal damage once · Host controls pauses' : 'Score first · Finish time breaks ties · No pause on disconnect'}</p></div><div className="duel-arena-actions"><DuelFullscreenButton/><button className="secondary" onClick={onExit}>Back to duels</button></div></header>
    {(error || message || (!locked && lease.message)) && <p role="alert">{error || message || (!locked && lease.message)}</p>}
    <p className={!terminal && match?.deadline && seconds <= 60 && !countdown ? 'duel-timer duel-timer--urgent' : 'duel-timer'} role="timer" aria-label="Remaining time">{terminal ? 'Duel ended' : match?.status==='paused'?`Paused · ${Math.floor(pausedSeconds/60)}:${String(pausedSeconds%60).padStart(2,'0')} remaining` : match?.status==='waiting' ? 'Waiting for both players' : introPhase==='versus' ? 'Versus introduction · timer has not started' : countdown ? `Starts in ${countdown}s` : `Time remaining ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`}</p>
    {!terminal && seconds > 0 && seconds <= 60 && !countdown && <p role="status">Final minute — finish your configuration before time expires.</p>}
    {showBattle&&<div className="duel-grid duel-scoreboard">{data?.participants?.map((p,index) => <article className={`duel-player ${index===1?'duel-player--right':''}`} key={p.id}><div className="duel-player-identity"><CliDuelCharacter characterId={p.characterId}/><h3>{p.displayName}{p.isOwn ? ' (you)' : ''}</h3></div><p>{p.scorePoints} / {p.maximumPoints} points · {p.status.replaceAll('_', ' ')}</p><CliDuelHealthBar hp={p.hp} maximumHp={p.maximumHp||100} name={p.displayName} side={index===1?'right':'left'}/><small>{match?.rulesVersion>=2 ? 'Damage is permanent; undoing or repeating an objective cannot regenerate HP or deal extra damage.' : 'HP reflects your opponent’s current verified score.'}</small></article>)}</div>}
    {match?.status==='completed' && match?.endReason==='knockout' && <p className="duel-outcome" role="status">{match.winnerParticipantId===own?.id ? 'Victory by knockout!' : 'Defeated by knockout.'} Both attempts are locked.</p>}
    {match?.status==='voided' && <p role="status">This duel was voided. Its original result is retained for audit.</p>}
    {match?.status==='cancelled' && <p role="status">This duel was cancelled. Both attempts are locked.</p>}
    {match?.hostControlled&&!match?.hasStarted&&['waiting','countdown'].includes(match?.status)&&<CliDuelWaitingRoom participants={data?.participants} onSelectCharacter={match.characterSelectionRequired&&own?()=>setSelectingCharacter(true):undefined} selectionDisabled={!fresh||busy||lease.status!=='active'||lease.connectionStatus!=='online'}/>}
    {selectingCharacter&&match?.characterSelectionRequired&&match.status==='waiting'&&!match.hasStarted&&own&&<CliDuelCharacterDialog own={own} disabled={!fresh||busy||lease.status!=='active'||lease.connectionStatus!=='online'} onConfirm={confirmCharacter} onClose={()=>setSelectingCharacter(false)}/>}
    {!match?.hostControlled&&match?.status==='waiting'&&<section className="duel-waiting" role="status"><span className="duel-waiting__icon" aria-hidden="true">⌛</span><h3>Waiting for your opponent</h3><p>{match?.hostControlled?'Stay here while the host prepares to start. Both players must be active before the host can begin the countdown.':'Both players must be inside the arena. The five-second countdown will begin automatically.'}</p><div className="duel-presence">{data?.participants?.map(p=><span key={p.id} className={p.inArena?'duel-presence--ready':''}>{p.displayName} · {p.inArena?'In arena':'Not in arena'}</span>)}</div></section>}
    {introPhase==='versus'&&<CliDuelVersus participants={data?.participants} onLeave={onExit}/>}
    {introPhase==='countdown'&&match?.arenaEntryRequired&&<CliDuelOverlay count={countdown} onLeave={onExit}><p>{countdown?'Keep this arena open and stay connected.':'Confirming both players are active…'}</p></CliDuelOverlay>}
    {match?.status==='paused'&&<p role="status" className="duel-paused-notice">Game paused by the host. Your time and configuration are saved; commands will unlock after Continue and a new five-second countdown.</p>}
    {match?.status==='completed'&&own&&!outcomeDismissed&&<CliDuelOverlay kind={draw||!winners.length?'result':won?'victory':'defeated'} title={draw?'DRAW':!winners.length?'DUEL COMPLETE':won?'VICTORY':'DEFEATED'} onClose={()=>setOutcomeDismissed(true)}><CliDuelCharacter characterId={own.characterId} size="result" showName/><p>{match.endReason==='knockout'?'The duel ended by knockout.':'Final ranking uses score, then finish time.'}</p></CliDuelOverlay>}

    {showBattle && data?.task && match?.rulesVersion!==3 && <section className="duel-task"><h3>Configuration task</h3><p>{data.task.instructions}</p></section>}
    {showBattle && data?.ownState && match?.rulesVersion===3 && <CliDuelDeviceConsole data={data} enabled={inputAllowed&&!queued.uncertain} onOperation={enqueueOperation} onFinish={showFinishConfirmation} readOnly={spectator} pendingOperations={queued.entries}/>}
    {showBattle && data?.ownState && match?.rulesVersion!==3 && <><div className="duel-terminal" aria-label="Your CLI command log" role="log">{data.ownCommands?.map(entry => <div key={entry.sequence}><code>{entry.command}</code>{entry.output && <pre>{entry.output}</pre>}</div>)}</div>
      <p className="duel-prompt"><code>{getDevicePrompt(data.ownState)}</code></p><form onSubmit={submit} className="duel-command"><label>Cisco command<input autoComplete="off" spellCheck="false" maxLength={500} value={command} disabled={!enabled} onChange={e => setCommand(e.target.value)} /></label><button className="primary" disabled={!enabled || !command.trim()}>Send command</button></form></>}
    {queued.uncertain&&!terminal&&own?.status==='in_progress'&&<div className="duel-actions"><button type="button" className="secondary" disabled={!inputAllowed||queued.sending} onClick={queued.retry}>Retry same command</button><button type="button" className="secondary" onClick={refresh}>Resynchronize</button></div>}
    {!!unsent.length&&<details className="duel-unsent"><summary>Recent commands needing review ({unsent.length})</summary><pre>{unsent.map(entry=>`${data?.task?.devices?.find(device=>device.id===entry.deviceId)?.label||'Device'}: ${fullOperationCommand(entry)}`).join('\n')}</pre><button type="button" className="secondary" onClick={()=>setUnsent([])}>Dismiss list</button></details>}
    {pending && !terminal && own?.status==='in_progress' && <div className="duel-actions"><button className="secondary" disabled={busy || lease.connectionStatus !== 'online'} onClick={() => send(pending)}>Retry same command</button><button className="secondary" disabled={busy} onClick={refresh}>Resynchronize</button></div>}
    {!locked && lease.status === 'blocked' && <button className="secondary" onClick={lease.retry}>Retry session access</button>}
    {!terminal && match?.rulesVersion!==3 && match?.status==='active' && own?.status === 'in_progress' && !countdown && !expired && <button className="secondary" disabled={busy || Boolean(pending)} onClick={() => setConfirmFinish(true)}>Finish attempt</button>}
    {confirmFinish && <div className="duel-controls"><p>Submit your current verified configuration? Your score will be locked and you cannot enter more commands.</p><div className="duel-actions"><button className="primary" disabled={busy || Boolean(pending) || queued.entries.length>0} onClick={finish}>Confirm finish</button><button className="secondary" onClick={() => setConfirmFinish(false)}>Continue working</button></div></div>}
    {own && own.status !== 'in_progress' && <p role="status">{terminal ? 'Match complete. Return to duels to see the final standings.' : 'Your attempt is locked. Waiting for the opponent or the deadline.'}</p>}
    <small>Connection: {lease.connectionStatus}. Scores are verified by the server.</small>
  </section></CliDuelStage>
}
