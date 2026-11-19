import CliDuelCharacter from './CliDuelCharacter'
export default function CliDuelWaitingRoom({participants=[],host=false,closed=false,onSelectCharacter,selectionDisabled=false}){
 const both=participants.length===2&&participants.every(player=>player.inArena)
 return <section className="duel-waiting-arena" aria-label="Arena waiting area">
  <div className="duel-waiting-arena__heading"><span className="eyebrow">CLI DUEL ARENA</span><h3>{closed?'Arena closed':'Waiting arena'}</h3><p>{closed?'Open match details to review the result.':host?(both?'Both players are here. Press Start game when you are ready.':'Waiting for both players to enter the arena.'):(both?'Both players are here. Waiting for the host to start.':'Waiting for the other player to enter the arena.')}</p></div>
  <div className="duel-waiting-roster">{participants.map((player,index)=><div className="duel-waiting-slot" key={player.id}>{index===1&&<span className="duel-waiting-versus" aria-hidden="true">VS</span>}<article className="duel-waiting-player">{player.characterId?<CliDuelCharacter characterId={player.characterId} size="waiting" showName/>:<span className="duel-waiting-avatar" aria-hidden="true">{player.displayName?.split(/\s+/).slice(0,2).map(word=>word[0]).join('')||'P'}</span>}{player.isOwn&&onSelectCharacter&&!closed&&<button type="button" className="secondary" disabled={selectionDisabled} onClick={onSelectCharacter}>Select character</button>}<h4>{player.displayName}{player.isOwn?' (you)':''}</h4><span className={player.inArena?'duel-status duel-status--online':'duel-status'}>{player.inArena?'In arena':'Waiting to enter'}</span></article></div>)}</div>
  {!closed&&<p className="duel-waiting-arena__hint">The task and terminals unlock when the match begins.</p>}
 </section>
}
