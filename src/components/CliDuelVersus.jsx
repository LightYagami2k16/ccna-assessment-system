import CliDuelOverlay from './CliDuelOverlay'
import CliDuelCharacter from './CliDuelCharacter'

export default function CliDuelVersus({participants=[],onLeave}){
 return <CliDuelOverlay kind="versus" title="VERSUS" onLeave={onLeave}><div className="duel-versus-lineup">{participants.slice(0,2).map((player,index)=><div className="duel-versus-slot" key={player.id}>{index===1&&<strong className="duel-versus-emblem" aria-hidden="true">VS</strong>}<article className={`duel-versus-player duel-versus-player--${index+1}`}><span className="duel-versus-label">PLAYER {index+1}</span><CliDuelCharacter characterId={player.characterId} size="hero" showName/><h3>{player.displayName}</h3></article></div>)}</div><p>Get ready. The exam timer starts when the arena unlocks.</p></CliDuelOverlay>
}
