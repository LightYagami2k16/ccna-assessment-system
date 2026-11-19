// Stable cosmetic IDs are also allowlisted by migration081. No gameplay modifiers.
export const DUEL_CHARACTERS = [
  {id:"eren-yeager",name:"Eren Yeager",src:new URL("../../assets/duel-characters/Eren Yeager.png",import.meta.url).href},
  {id:"asta",name:"Asta",src:new URL("../../assets/duel-characters/Asta.png",import.meta.url).href},
  {id:"natsu-dragneel",name:"Natsu Dragneel",src:new URL("../../assets/duel-characters/Natsu Dragneel.png",import.meta.url).href},
  {id:"ichigo-kurosaki",name:"Ichigo Kurosaki",src:new URL("../../assets/duel-characters/Ichigo Kurosaki.png",import.meta.url).href},
  {id:"monkey-d-luffy",name:"Monkey D. Luffy",src:new URL("../../assets/duel-characters/Monkey D. Luffy.png",import.meta.url).href},
  {id:"meliodas",name:"Meliodas",src:new URL("../../assets/duel-characters/Meliodas.png",import.meta.url).href},
  {id:"uzumaki-naruto",name:"Uzumaki Naruto",src:new URL("../../assets/duel-characters/Uzumaki Naruto.png",import.meta.url).href},
  {id:"son-goku",name:"Son Goku",src:new URL("../../assets/duel-characters/Son Goku.png",import.meta.url).href},
  {id:"sung-jinwoo",name:"Sung Jinwoo",src:new URL("../../assets/duel-characters/Sung Jinwoo.png",import.meta.url).href},
  {id:"izuku-midoriya",name:"Izuku Midoriya",src:new URL("../../assets/duel-characters/Izuku Midoriya.png",import.meta.url).href},
  {id:"yuji-itadori",name:"Yuji Itadori",src:new URL("../../assets/duel-characters/Yuji Itadori.png",import.meta.url).href},
  {id:"shinra-kusakabe",name:"Shinra Kusakabe",src:new URL("../../assets/duel-characters/Shinra Kusakabe.png",import.meta.url).href},
  {id:"gon-freecss",name:"Gon Freecss",src:new URL("../../assets/duel-characters/Gon Freecss.png",import.meta.url).href},
  {id:"ken-kaneki",name:"Ken Kaneki",src:new URL("../../assets/duel-characters/Ken Kaneki.png",import.meta.url).href},
  {id:"saitama",name:"Saitama",src:new URL("../../assets/duel-characters/Saitama.png",import.meta.url).href}
]
export function getDuelCharacter(id){return DUEL_CHARACTERS.find(character=>character.id===id)||null}
export function getDuelIntroPhase(match){if(match?.status!=='countdown')return null;return !match.hasStarted&&match.versusEndsAt?'versus':'countdown'}
