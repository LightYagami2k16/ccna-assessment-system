import CliDuelCharacter from './CliDuelCharacter'
import { useCallback, useState } from 'react'
import useCliDuel from '../hooks/useCliDuel'
import { getDuelReview } from '../services/cliDuelService'
import LibraryItemDialog from './LibraryItemDialog'
import CliReviewDeviceGroups from './CliReviewDeviceGroups'
import CliReviewCommandLog from './CliReviewCommandLog'

export default function CliDuelReview({ participantId, matchId, onClose }) {
  const loader = useCallback(() => getDuelReview(participantId), [participantId])
  const { data, error, loading } = useCliDuel(loader, matchId)
  const [tab, setTab] = useState('criteria')
  return <LibraryItemDialog open title={data?.title || 'Duel attempt review'} onClose={onClose} eyebrow="COMPETITION HISTORY">
    {loading && <p role="status">Loading review…</p>}{error && <p role="alert">{error}</p>}
    {data && <><CliDuelCharacter characterId={data.characterId} showName/>{data.combat && <p>Starting HP: {data.combat.startingHp} · Outcome: {data.endReason?.replaceAll('_',' ')}</p>}<p>{data.displayName} · {data.scorePoints} / {data.maximumPoints} points</p>
      <div className="duel-actions" role="tablist" aria-label="Duel review"><button role="tab" aria-selected={tab === 'criteria'} onClick={() => setTab('criteria')}>Expected configuration</button><button role="tab" aria-selected={tab === 'commands'} onClick={() => setTab('commands')}>Command log</button><button role="tab" aria-selected={tab === 'timeline'} onClick={() => setTab('timeline')}>Timeline</button></div>
      <div role="tabpanel">{tab === 'criteria' ? <CliReviewDeviceGroups criteria={data.criteria} state={data.state} filterable>{(criterion, index) => <article key={index}><strong>{criterion.label || criterion.type}</strong><p>{criterion.target} · Expected: <code>{String(criterion.expected ?? '')}</code></p><p>{criterion.met ? 'Met' : 'Not met'} · {criterion.pointsAwarded ?? 0} / {criterion.points} points{criterion.damage!=null ? ` · ${criterion.damage} damage (once)` : ''}</p></article>}</CliReviewDeviceGroups> : tab === 'commands' ? <CliReviewCommandLog commands={data.commands} criteria={data.criteria} state={data.state} /> : <ol>{data.timeline.map((entry,index) => <li key={index}><strong>{entry.kind.replaceAll('_',' ')}</strong> · {new Date(entry.at).toLocaleString()}<p>{entry.participantId ? `Participant: ${entry.participantId}` : ''}{entry.actorId ? ` · Actor: ${entry.actorId}` : ''}</p><p>{entry.details?.objectiveId ? `Objective: ${entry.details.objectiveId} · ` : ''}{entry.details?.damage != null ? `Damage: ${entry.details.damage} · ` : ''}{entry.details?.sequence != null ? `Command #${entry.details.sequence} · ` : ''}{entry.details?.scorePoints != null ? `Score: ${entry.details.scorePoints} · ` : ''}{entry.details?.delta != null ? `Change: ${entry.details.delta} · ` : ''}{entry.details?.reason || ''}</p></li>)}</ol>}</div>
    </>}
  </LibraryItemDialog>
}
