// Only final server results decide a winner; never infer one from live score or HP.
export function getDuelWinners(competition,participants=[]){
 if(competition?.status!=='completed')return []
 if(competition.endReason==='knockout')return participants.filter(player=>player.id===competition.winnerParticipantId)
 return participants.filter(player=>player.placement===1)
}
