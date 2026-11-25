// A draft is local text, never permission to execute or award points.
export function getDuelInputPolicy({hasState,ownsAttempt,participantStatus,matchStatus,leaseStatus,online,fresh,expired,countdown,uncertain}){
 const canDraft=Boolean(hasState&&ownsAttempt&&participantStatus==='in_progress'&&matchStatus==='active'&&leaseStatus==='active'&&!expired&&!countdown)
 return {canDraft,canSubmit:canDraft&&Boolean(online&&fresh&&!uncertain)}
}
