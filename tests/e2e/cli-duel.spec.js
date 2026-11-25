import {test,expect} from '@playwright/test'
test.use({video:'off'})
test('instructor has a separate duel workspace with scoped candidates and setup feedback',async({page})=>{
 await page.route('**/rest/v1/**',route=>{const name=new URL(route.request().url()).pathname.split('/').at(-1);return route.fulfill({json:name==='get_cli_duel_workspace'?{canHost:true,matches:[],compatibleLabs:[{id:'lab',title:'Single switch',errors:[],durationMinutes:5}],candidates:[{studentId:'s1',displayName:'Student One',classId:'c1',className:'My class'},{studentId:'s2',displayName:'Student Two',classId:'c1',className:'My class'}]}:[]})})
 await page.goto('/?uat-role=instructor#/instructor/competitions')
 await expect(page.getByRole('heading',{name:'CLI Duels',exact:true,level:2})).toBeVisible()
 await page.getByRole('button',{name:'Create duel',exact:true}).click()
 await expect(page.getByLabel('Duration (minutes)',{exact:true})).toHaveAttribute('max','480')
 await expect(page.getByRole('combobox',{name:'Player 1',exact:true}).locator('option')).toHaveCount(3)
 await page.getByRole('combobox',{name:'Player 1',exact:true}).selectOption(JSON.stringify(['s1','c1']))
 await expect(page.getByRole('combobox',{name:'Player 2',exact:true}).locator('option').nth(1)).toHaveJSProperty('disabled',true)
})
test('student duel page does not expose host creation',async({page})=>{
 await page.route('**/rest/v1/**',route=>route.fulfill({json:new URL(route.request().url()).pathname.endsWith('get_cli_duel_workspace')?{canHost:false,matches:[],candidates:[],compatibleLabs:[]}:[]}))
 await page.goto('/?uat-role=student#/student/competitions')
 await expect(page.getByRole('heading',{name:'CLI Duels',exact:true,level:2})).toBeVisible()
 await expect(page.getByRole('button',{name:'Create duel',exact:true})).toHaveCount(0)
 await expect(page.getByText('No duels yet.',{exact:true}).first()).toBeVisible()
})
const pid='00000000-0000-4000-8000-000000000002'
function summary(status='lobby') {return {competition:{id:'00000000-0000-4000-8000-000000000001',title:'Campus showdown',status,durationMinutes:1,canHost:true,allowReview:false},participants:[{id:pid,displayName:'Student One',status:'ready',scorePoints:10,maximumPoints:20,hp:100},{id:'other',displayName:'Student Two',status:'invited',scorePoints:0,maximumPoints:20,hp:50}],serverNow:new Date().toISOString(),revision:1}}
test('host start waits for both players to be ready',async({page})=>{
 const match=summary()
 await page.route('**/rest/v1/**',route=>{const name=new URL(route.request().url()).pathname.split('/').at(-1);return route.fulfill({json:name==='get_cli_duel_workspace'?{canHost:true,matches:[match],candidates:[],compatibleLabs:[]}:name==='get_cli_duel'?match:[]})})
 await page.goto('/?uat-role=instructor#/instructor/competitions')
 await page.getByRole('button',{name:'Show details',exact:true}).click()
 await expect(page.getByRole('button',{name:'Start duel',exact:true})).toBeDisabled()
})

test('student arena uses authoritative timer, sends no forged state and locks at deadline',async({page},testInfo)=>{
 const start=Date.now()-10000
 const match=summary('active');match.competition.canHost=false;match.competition.startsAt=new Date(start).toISOString();match.competition.deadline=new Date(Date.now()+45000).toISOString();match.participants[0].isOwn=true;match.participants[0].status='in_progress'
 let revision=0;const commands=[];const player=()=>({...match,serverNow:new Date().toISOString(),revision,ownParticipant:match.participants[0],opponentSummary:match.participants[1],task:{instructions:'Set the hostname.'},ownState:{hostname:'Switch'},ownCommands:commands})
 await page.route('**/rest/v1/**',route=>{const name=new URL(route.request().url()).pathname.split('/').at(-1);return route.fulfill({json:name==='get_cli_duel_player_updates'?player():name==='claim_assessment_client_session'?{claimed:true}:name==='get_student_active_assessment_session'?null:[]})})
 await page.route('**/functions/v1/cli-duel',route=>{const body=route.request().postDataJSON();expect(Object.keys(body).sort()).toEqual(['action','participantId','clientId','commandId','sequence','expectedRevision','command'].sort());commands.push({sequence:++revision,command:body.command,output:'Verified',accepted:true});return route.fulfill({json:player()})})
 await page.goto(`/?uat-role=student#/student/competition/${pid}`)
 await expect(page.getByText('Final minute — finish your configuration before time expires.')).toBeVisible()
 const input=page.getByRole('textbox',{name:'Cisco command',exact:true});await expect(input).toBeEnabled();await input.fill('enable');await page.getByRole('button',{name:'Send command',exact:true}).click()
 await expect(page.getByRole('log')).toContainText('Verified')
 expect((await input.boundingBox()).width).toBeGreaterThan(400)
 await page.locator('.duel-arena').screenshot({path:testInfo.outputPath('arena-desktop-final.png')})
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1)
 await page.locator('.duel-arena').screenshot({path:testInfo.outputPath('arena-phone-final.png')})
 match.competition.deadline=new Date(Date.now()-1000).toISOString()
 await expect(input).toBeDisabled({timeout:15000})
})
test('missing local migrations show a contained setup state',async({page})=>{
 await page.route('**/rest/v1/**',route=>new URL(route.request().url()).pathname.endsWith('get_cli_duel_workspace')?route.fulfill({status:404,json:{code:'PGRST202',message:'Missing routine'}}):route.fulfill({json:[]}))
 await page.goto('/?uat-role=administrator#/admin/competitions')
 await expect(page.getByRole('alert')).toContainText('not set up')
 await expect(page.getByRole('button',{name:'Create duel',exact:true})).toHaveCount(0)
})
test('uncertain command survives failed resync, canonical prompt returns and stale quiz cannot replace duel URL',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('ccna-student-active-quiz-attempt:uat-student','stale-quiz'))
 const match=summary('active');match.competition.canHost=false;match.competition.startsAt=new Date(Date.now()-1000).toISOString();match.competition.deadline=new Date(Date.now()+120000).toISOString();match.participants[0].isOwn=true;match.participants[0].status='in_progress'
 let failedReads=false,revision=0;const bodies=[]
 const player=()=>({...match,serverNow:new Date().toISOString(),revision,ownParticipant:match.participants[0],ownState:{hostname:'Campus',mode:'global_config'},task:{instructions:'Configure the switch.'},ownCommands:revision?[{sequence:1,command:'hostname Campus',accepted:true,output:'Committed'}]:[]})
 await page.route('**/rest/v1/**',route=>{const name=new URL(route.request().url()).pathname.split('/').at(-1);if(name==='get_cli_duel_player_updates'&&failedReads)return route.abort('internetdisconnected');return route.fulfill({json:name==='get_cli_duel_player_updates'?player():name==='claim_assessment_client_session'?{claimed:true}:null})})
 await page.route('**/functions/v1/cli-duel',route=>{bodies.push(route.request().postDataJSON());if(bodies.length===1){failedReads=true;return route.abort('internetdisconnected')}failedReads=false;revision=1;return route.fulfill({json:player()})})
 await page.goto(`/?uat-role=student#/student/competition/${pid}`)
 await expect(page.locator('.duel-prompt')).toHaveText('Campus(config)#')
 await page.reload();await expect(page.locator('.duel-prompt')).toHaveText('Campus(config)#');await expect(page).toHaveURL(new RegExp(`/competition/${pid}$`))
 const input=page.getByRole('textbox',{name:'Cisco command',exact:true});await expect(input).toBeEnabled();await input.fill('hostname Campus');await page.getByRole('button',{name:'Send command',exact:true}).click()
 await expect(page.getByRole('button',{name:'Retry same command',exact:true})).toBeVisible()
 await page.getByRole('button',{name:'Resynchronize',exact:true}).click();await expect(input).toBeDisabled();await expect(page.locator('.duel-prompt')).toHaveText('Campus(config)#')
 await page.getByRole('button',{name:'Retry same command',exact:true}).click();await expect(page.getByRole('log')).toContainText('Committed');expect(bodies).toHaveLength(2);expect(bodies[1]).toEqual(bodies[0])
})
test('voided host history retains audit timeline and expected configuration',async({page})=>{
 const match=summary('voided');match.competition.voidReason='Classroom connectivity issue'
 await page.route('**/rest/v1/**',route=>{const name=new URL(route.request().url()).pathname.split('/').at(-1);const data=name==='get_cli_duel_workspace'?{canHost:true,matches:[match],compatibleLabs:[],candidates:[]}:name==='get_cli_duel'?match:name==='get_cli_duel_review'?{title:match.competition.title,displayName:'Student One',scorePoints:10,maximumPoints:20,criteria:[],commands:[],timeline:[{kind:'objective_hit',at:new Date().toISOString(),details:{objectiveId:'objective-1',damage:40}},{kind:'void',at:new Date().toISOString(),details:{reason:'Classroom connectivity issue'}}]}:[];return route.fulfill({json:data})})
 await page.goto('/?uat-role=instructor#/instructor/competitions');await page.getByRole('button',{name:'Show details',exact:true}).click();await expect(page.getByText('Recorded reason: Classroom connectivity issue')).toBeVisible();await page.getByRole('button',{name:'Inspect attempt',exact:true}).first().click();await page.getByRole('tab',{name:'Timeline',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('Classroom connectivity issue');await expect(page.getByRole('dialog')).toContainText('Objective: objective-1');await expect(page.getByRole('dialog')).toContainText('Damage: 40')
})
test('v2 rematch loads frozen configuration into the full practical builder',async({page})=>{
 const match=summary('completed');match.competition.rulesVersion=2;match.competition.startingHp=200
 const definition={version:2,courseId:1,title:'Rematch source',instructions:'Original task',durationMinutes:3,devices:[{id:'d1',type:'switch',label:'Switch',hostname:'Switch'}],topology:{links:[]},criteria:[{type:'hostname',target:'',expected:'Campus',points:10,deviceId:'d1'}],combat:{startingHp:200,damage:[200]}}
 await page.route('**/rest/v1/**',route=>{const name=new URL(route.request().url()).pathname.split('/').at(-1);return route.fulfill({json:name==='get_cli_duel_workspace'?{canHost:true,matches:[match],compatibleLabs:[],candidates:[]}:name==='get_cli_duel_configuration'?{definition}:name==='get_cli_duel'?match:name==='courses'?[{id:1,code:'ITN',title:'Networks'}]:[]})})
 await page.goto('/?uat-role=instructor#/instructor/competitions');await page.getByRole('button',{name:'Show details',exact:true}).click();await page.getByRole('button',{name:'Create rematch',exact:true}).click()
 await expect(page.getByRole('spinbutton',{name:'Starting HP',exact:true})).toHaveValue('200')
 await expect(page.getByRole('spinbutton',{name:'Damage for criterion 1',exact:true})).toHaveValue('200')
 await expect(page.getByRole('group',{name:'Devices and topology',exact:true})).toBeVisible()
})

test('v2 voided arena shows custom HP and audit status without a current victory',async({page})=>{
 const match=summary('voided');match.competition.rulesVersion=2;match.competition.startingHp=200;match.competition.endReason='voided';match.competition.winnerParticipantId=null;match.competition.canHost=false
 for(const p of match.participants){p.maximumHp=200;p.hp=100;p.status='submitted'}match.participants[0].isOwn=true
 await page.route('**/rest/v1/**',route=>{const name=new URL(route.request().url()).pathname.split('/').at(-1);return route.fulfill({json:name==='get_cli_duel_player_updates'?{...match,ownParticipant:match.participants[0],ownState:null,ownCommands:[],revision:2}:name==='claim_assessment_client_session'?{claimed:true}:null})})
 await page.goto(`/?uat-role=student#/student/competition/${pid}`);await expect(page.getByText('This duel was voided. Its original result is retained for audit.',{exact:true})).toBeVisible();await expect(page.getByRole('timer')).toHaveText('Duel ended');await expect(page.locator('meter').first()).toHaveAttribute('max','200');await expect(page.getByText(/Damage is permanent/).first()).toBeVisible();await expect(page.getByText('Victory by knockout! Both attempts are locked.',{exact:true})).toHaveCount(0)
})
