import CliDuelCharacter from './CliDuelCharacter'
import { useCallback, useState } from 'react'
import useCliDuel from '../hooks/useCliDuel'
import { getDuel, readyDuel, startDuel, manageDuel, releaseDuelReview, enterDuelArena, duelError } from '../services/cliDuelService'
import { getAssessmentClientId } from '../services/assessmentClientSessionService'
import CliDuelReview from './CliDuelReview'
import CliDuelHostArena from './CliDuelHostArena'

export default function CliDuelLobby({ id, onPlay, onRematch, onBack }) {
  const loader = useCallback(() => getDuel(id), [id])
  const { data, error, loading, refresh } = useCliDuel(loader, id)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [reason, setReason] = useState('')
  const [review, setReview] = useState(null)
  const [showDetails,setShowDetails]=useState(false)
  const match = data?.competition
  const own = data?.participants?.find(p => p.isOwn)
  async function act(action) {
    setBusy(true); setMessage('')
    try { await action(); await refresh() } catch (failure) { setMessage(duelError(failure)) } finally { setBusy(false) }
  }
  if (loading) return <p role="status">Loading duel…</p>
  if (!match) return <p role="alert">{error || 'This duel is unavailable.'}</p>
  if(match.canHost&&match.hostControlled&&!showDetails)return <CliDuelHostArena id={id} onBack={onBack} onHistory={()=>setShowDetails(true)}/>
  return <section className="duel-lobby">
    {onBack&&<div className="duel-actions"><button className="secondary" onClick={onBack}>Back to duels</button>{match.canHost&&match.hostControlled&&<button className="primary" onClick={()=>setShowDetails(false)}>Return to host arena</button>}</div>}
    <header><span className="eyebrow">{match.status}</span><h2>{match.title}</h2><p>{match.durationMinutes} minutes · {match.hostControlled?'Host starts once both players enter':match.arenaEntryRequired?'Both players enter, then a 5-second countdown':'Shared 10-second countdown'} · Host: {match.hostName}</p></header>
    {match.rulesVersion>=2 && <p>Starting HP: {match.startingHp} each · Each objective deals damage once · Zero HP ends the duel.</p>}
    {(error || message) && <p role="alert">{error || message}</p>}
    <div className="duel-grid">{data.participants.map(p => <article className="duel-player" key={p.id}><CliDuelCharacter characterId={p.characterId} showName/><h3>{p.displayName}{p.isOwn ? ' (you)' : ''}</h3><p>{p.status.replaceAll('_', ' ')}</p>
      <strong>{p.scorePoints} / {p.maximumPoints} points</strong><p>{p.placement ? `Rank ${p.placement} · ` : ''}{p.elapsedMs != null ? `${(p.elapsedMs / 1000).toFixed(2)} seconds` : 'Not finished'}</p>
      {(match.canHost || (match.status === 'completed' && p.isOwn && match.allowReview)) && <button className="secondary" onClick={() => setReview(p.id)}>{match.canHost ? 'Inspect attempt' : 'Review attempt'}</button>}</article>)}</div>
    {(match.cancelReason || match.voidReason) && <p>Recorded reason: {match.cancelReason || match.voidReason}</p>}
    {match.status === 'lobby' && <div className="duel-actions">
      {own && <button className="primary" disabled={busy} onClick={() => act(() => readyDuel(id, getAssessmentClientId(), own.status !== 'ready'))}>{own.status === 'ready' ? 'Not ready' : 'Ready to compete'}</button>}
      {match.canHost && <button className="primary" disabled={busy || !data.participants.every(p => p.status === 'ready')} onClick={() => act(() => startDuel(id))}>{match.arenaEntryRequired?'Open arena':'Start duel'}</button>}
      <p>After the host opens the arena, both students enter. Instructions unlock when the countdown ends.</p>
    </div>}
    {own && ['waiting','countdown','active','paused'].includes(match.status)&&(!match.hostControlled||['invited','ready','in_progress','submitted'].includes(own.status))&&<button className="primary" disabled={busy} onClick={()=>match.hostControlled&&own.status!=='submitted'?act(async()=>{await enterDuelArena(own.id,getAssessmentClientId());onPlay?.(own.id)}):onPlay?.(own.id)}>{own.status==='submitted'?'Watch arena':'Enter arena'}</button>}
    {match.status==='waiting'&&<p className="duel-lobby-notice">Arena open. Enter and wait for the host to start; the exam timer has not started.</p>}
    {match.deadline && ['countdown', 'active'].includes(match.status) && <p>Deadline: {new Date(match.deadline).toLocaleString()}. Disconnecting does not pause the clock.</p>}
    {match.status === 'completed' && <p>{match.endReason==='knockout' ? `Victory by knockout: ${data.participants.find(p=>p.id===match.winnerParticipantId)?.displayName || 'Winner'}. Both attempts are locked.` : match.endReason==='time_expired' ? 'Time expired. Final ranking uses score first, finish time second. Exact ties share a rank.' : 'Both attempts finished. Final ranking uses score first, finish time second. Exact ties share a rank.'}</p>}
    {match.canHost && <div className="duel-controls">
      {match.status === 'completed' && <div className="duel-actions"><button className="secondary" disabled={busy} onClick={() => act(() => releaseDuelReview(id, !match.allowReview))}>{match.allowReview ? 'Withdraw student review' : 'Release student review'}</button><button className="secondary" onClick={() => onRematch(id)}>Create rematch</button></div>}
      {['lobby','waiting','countdown','active','paused','completed'].includes(match.status) && <form onSubmit={e => { e.preventDefault(); void act(() => manageDuel(id, match.status === 'completed' ? 'void' : 'cancel', reason)) }}>
        <label>Reason to {match.status === 'completed' ? 'void' : 'cancel'} match<input required maxLength={500} value={reason} onChange={e => setReason(e.target.value)} /></label><button className="secondary" disabled={busy}>{match.status === 'completed' ? 'Void result' : 'Cancel match'}</button><small>The history is retained.</small></form>}
    </div>}
    {review && <CliDuelReview key={review} participantId={review} matchId={id} onClose={() => setReview(null)} />}
  </section>
}
