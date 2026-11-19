import { chromium, expect as baseExpect } from '@playwright/test'
import {createClient} from '@supabase/supabase-js'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
const expect=baseExpect.configure({timeout:25000})
const fixture=JSON.parse(await readFile(join(tmpdir(),'ccna-cli-duel-baseline-20261116-153425/local-stack/test-accounts-private.json'),'utf8'))
if(fixture.url!=='http://127.0.0.1:55321')throw new Error('Only the disposable loopback stack is allowed.')
console.log('Checking isolated local fixture and interrupted fictional matches…')
const cleanupApi=createClient(fixture.url,fixture.publishableKey,{auth:{persistSession:false,autoRefreshToken:false}});const cleanupLogin=await cleanupApi.auth.signInWithPassword({email:fixture.accounts[0].email,password:fixture.password});if(cleanupLogin.error)throw cleanupLogin.error;const previous=await cleanupApi.rpc('get_cli_duel_workspace');if(previous.error)throw previous.error;for(const item of previous.data.matches||[])if(/^Browser Duel \d+$/.test(item.competition.title)&&['waiting','active','countdown','paused'].includes(item.competition.status)){const cancelled=await cleanupApi.rpc('manage_cli_duel',{p_competition_id:item.competition.id,p_action:'cancel',p_reason:'Clean interrupted fictional browser acceptance'});if(cancelled.error)throw cancelled.error}
console.log('Launching local acceptance browser…')
const browser=await chromium.launch({timeout:90000})
console.log('Acceptance browser launched.')
async function bounded(promise,label){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(`${label} timed out before application interaction.`)),30000)})])}finally{clearTimeout(timer)}}
const title=`Browser Duel ${Date.now()}`
const output='test-results/cli-duel-real-local'
await mkdir(output,{recursive:true})
const diagnostics=[]
try {
  const pages=[]
  for(const account of fixture.accounts.slice(0,3)){
    console.log(`Opening local account context ${pages.length+1}/3…`)
    const context=await bounded(browser.newContext({viewport:{width:1366,height:900}}),'Browser context creation')
    const page=await bounded(context.newPage(),'Blank page creation');page.setDefaultTimeout(30000)
    const starts=new WeakMap(),label=account.name
    page.on('request',request=>{const name=new URL(request.url()).pathname.split('/').at(-1);if(['set_cli_duel_arena_presence','get_cli_duel_player','control_cli_duel'].includes(name))starts.set(request,{at:Date.now(),name,entered:name==='set_cli_duel_arena_presence'?request.postDataJSON().p_entered:undefined})})
    page.on('response',async response=>{const info=starts.get(response.request());if(!info)return;try{const result=await response.json();diagnostics.push({...info,label,ms:Date.now()-info.at,http:response.status(),status:result.competition?.status,versusEndsAt:result.competition?.versusEndsAt,present:result.participants?.map(p=>p.inArena)})}catch{/* no body after page closes */}})
    page.on('requestfailed',request=>{const info=starts.get(request);if(info)diagnostics.push({...info,label,ms:Date.now()-info.at,failed:request.failure()?.errorText})})
    const section=account.role==='instructor'?'instructor':'student'
    await page.goto(`http://127.0.0.1:5174/#/${section}/competitions`)
    await page.getByRole('textbox',{name:'Email',exact:true}).fill(account.email)
    await page.getByLabel('Password',{exact:true}).fill(fixture.password)
    await page.getByRole('button',{name:'Sign in',exact:true}).click()
    await page.getByRole('button',{name:/^CLI Duels /}).click()
    await expect(page.getByRole('heading',{name:'CLI Duels',exact:true,level:2})).toBeVisible()
    pages.push(page);console.log(`Local account ${pages.length}/3 signed in and ready.`)
  }
  const [host,one,two]=pages
  await host.getByRole('button',{name:'Create duel',exact:true}).click()

  await host.getByRole('combobox',{name:'Load from CLI practical (optional)',exact:true}).selectOption(fixture.labId)
  await expect(host.getByRole('textbox',{name:'Duel title',exact:true})).not.toHaveValue('')
  await host.getByRole('textbox',{name:'Duel title',exact:true}).fill(title)
  await host.getByRole('spinbutton',{name:'Starting HP',exact:true}).fill('200')
  await host.getByRole('button',{name:'Distribute damage by points',exact:true}).click()
  await host.locator('.duel-create').screenshot({path:join(output,'customization-desktop.png')})
  await host.setViewportSize({width:390,height:844})
  expect(await host.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1)
  await host.locator('.duel-create').screenshot({path:join(output,'customization-phone.png')})
  await host.setViewportSize({width:1366,height:900})
  await host.getByLabel('Duration (minutes)',{exact:true}).fill('3')
  await host.getByRole('combobox',{name:'Player 1',exact:true}).selectOption(JSON.stringify([fixture.accounts[1].id,fixture.classId]))
  await host.getByRole('combobox',{name:'Player 2',exact:true}).selectOption(JSON.stringify([fixture.accounts[2].id,fixture.classId]))
  await host.getByRole('checkbox',{name:'Release own-attempt review automatically after the entire match ends',exact:true}).check()
  await host.getByRole('button',{name:'Create match',exact:true}).click()
  await expect(host.getByRole('heading',{name:title,exact:true,level:2})).toBeVisible()
  await expect(host.getByRole('button',{name:'Start game',exact:true})).toBeDisabled();await expect(host.locator('.cisco-terminal')).toHaveCount(0);await expect(host.locator('.duel-host-task')).toHaveCount(0);await host.locator('.duel-host-arena').screenshot({path:join(output,'host-waiting.png')})
  for(const page of [one,two]){
    const card=page.locator('.duel-match').filter({has:page.getByRole('heading',{name:title,exact:true})})
    await expect(card).toBeVisible();await card.getByRole('button',{name:'Enter arena',exact:true}).click();await expect(page.getByRole('heading',{name:'Waiting arena',exact:true})).toBeVisible();await page.getByRole('button',{name:'Select character',exact:true}).click();await page.getByRole('group',{name:'Choose your character'}).getByRole('button',{name:'Asta',exact:true}).click();await page.getByRole('button',{name:'Confirm character',exact:true}).click();await expect(page.getByRole('dialog',{name:'Select character',exact:true})).toHaveCount(0);await expect(page.getByRole('region',{name:'Arena waiting area'}).getByRole('img',{name:'Asta',exact:true})).toBeVisible()
  }
  await expect(host.getByRole('button',{name:'Start game',exact:true})).toBeEnabled();await one.waitForTimeout(1200);await expect(one.getByRole('timer')).toHaveText('Waiting for both players')
  await host.getByRole('button',{name:'Leave arena',exact:true}).click();const hostCard=host.locator('.duel-match').filter({has:host.getByRole('heading',{name:title,exact:true})});await hostCard.getByRole('button',{name:'Enter host arena',exact:true}).click();await expect(host.getByRole('button',{name:'Start game',exact:true})).toBeEnabled()
  await host.getByRole('button',{name:'Start game',exact:true}).click();await expect(one.getByRole('dialog')).toBeVisible();await expect(host.locator('.cisco-terminal')).toHaveCount(0);await two.context().setOffline(true);await expect(one.getByRole('heading',{name:'Waiting arena',exact:true})).toBeVisible();await expect(one.getByRole('dialog')).toHaveCount(0);await two.context().setOffline(false);await expect(two.locator('.duel-arena > small')).toContainText('Connection: online');await two.waitForTimeout(3500);await expect(host.getByRole('button',{name:'Start game',exact:true})).toBeEnabled();await host.getByRole('button',{name:'Start game',exact:true}).click();await expect(one.getByRole('dialog')).toBeVisible();await one.getByRole('dialog').screenshot({path:join(output,'five-second-countdown.png')})
  await expect(one.getByRole('heading',{name:'VERSUS',exact:true})).toBeVisible();await expect(host.getByRole('heading',{name:'VERSUS',exact:true})).toBeVisible();await one.getByRole('dialog').screenshot({path:join(output,'versus-introduction.png')});
  for(const page of [one,two])await expect(page.getByRole('textbox',{name:'Cisco command',exact:true})).toBeEnabled()
  async function command(page,text,terminal=false){const input=page.getByRole('textbox',{name:'Cisco command',exact:true});await expect(input).toBeEnabled();await input.fill(text);await input.press('Enter');if(terminal)await expect(input).toHaveCount(0);else await expect(input).toHaveValue('')}
  await Promise.all([command(one,'enable'),command(two,'enable')])
  await Promise.all([command(one,'conf t'),command(two,'conf t')])
  await Promise.all([command(one,'hostname Campus'),command(two,'hostname Other')])
  await expect(one.locator('.duel-prompt')).toHaveText('Campus(config)#')
  await expect(two.locator('.duel-player').filter({hasText:'Player Two (you)'})).toContainText('100 / 200')
  await expect(host.locator('.duel-host-player').first().getByRole('log')).toContainText('hostname Campus')
  const columns=await Promise.all([host.locator('.duel-host-player').first().boundingBox(),host.locator('.duel-host-task').boundingBox(),host.locator('.duel-host-player').last().boundingBox()]);expect(columns[0].x).toBeLessThan(columns[1].x);expect(columns[1].x).toBeLessThan(columns[2].x)
  await host.getByRole('button',{name:/Pause game/}).click();for(const page of [one,two])await expect(page.getByRole('textbox',{name:'Cisco command',exact:true})).toBeDisabled();await expect(host.getByRole('timer')).toContainText('Time frozen');await host.locator('.duel-host-arena').screenshot({path:join(output,'host-desktop.png')});await host.setViewportSize({width:390,height:844});expect(await host.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);await host.locator('.duel-host-arena').screenshot({path:join(output,'host-phone.png')});await host.setViewportSize({width:1366,height:900});await host.getByRole('button',{name:'Leave arena',exact:true}).click();await host.locator('.duel-match').filter({has:host.getByRole('heading',{name:title,exact:true})}).getByRole('button',{name:'Enter host arena',exact:true}).click();await expect(host.getByRole('button',{name:/Continue game/})).toBeEnabled();await host.getByRole('button',{name:/Continue game/}).click();for(const page of [one,two])await expect(page.getByRole('textbox',{name:'Cisco command',exact:true})).toBeEnabled()
  await one.screenshot({path:join(output,'arena-desktop.png'),fullPage:true})
  await one.setViewportSize({width:390,height:844})
  expect(await one.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1)
  await one.screenshot({path:join(output,'arena-phone.png'),fullPage:true})
  await two.reload();await expect(two.locator('.duel-prompt')).toHaveText('Other(config)#')
  await command(one,'end');await command(one,'wr',true)
  await expect(one.getByRole('dialog').getByRole('heading',{name:'VICTORY',exact:true})).toBeVisible();await expect(two.getByRole('dialog').getByRole('heading',{name:'DEFEATED',exact:true})).toBeVisible();await expect(one.getByRole('dialog')).not.toContainText('points');await expect(two.getByRole('dialog')).not.toContainText('points');await expect(host.getByRole('dialog').getByRole('heading',{name:'WINNER',exact:true})).toBeVisible();await expect(host.getByRole('dialog')).toContainText(fixture.accounts[1].name);await expect(host.getByRole('dialog')).not.toContainText('points');await host.getByRole('dialog').screenshot({path:join(output,'host-winner.png')});await host.getByRole('button',{name:'View result',exact:true}).click();const resultBox=await one.getByRole('dialog').boundingBox();expect(Math.abs(resultBox.x+resultBox.width/2-195)).toBeLessThan(2);expect(Math.abs(resultBox.y+resultBox.height/2-422)).toBeLessThan(2);await one.getByRole('dialog').screenshot({path:join(output,'victory-phone.png')});await one.getByRole('button',{name:'View result',exact:true}).click();await two.getByRole('button',{name:'View result',exact:true}).click();
  await expect(one.getByText('Victory by knockout! Both attempts are locked.',{exact:true})).toBeVisible()
  await expect(two.getByText('Defeated by knockout. Both attempts are locked.',{exact:true})).toBeVisible()
  await expect(one.getByRole('textbox',{name:'Cisco command',exact:true})).toHaveCount(0)
  await expect(two.getByRole('textbox',{name:'Cisco command',exact:true})).toHaveCount(0)
  await one.waitForTimeout(21000)
  await expect(one.getByRole('button',{name:'Retry session access',exact:true})).toHaveCount(0)
  await expect(one.getByText('Match complete. Return to duels to see the final standings.',{exact:true})).toBeVisible()
  await one.getByRole('button',{name:'Back to duels',exact:true}).click()
  const history=one.locator('.duel-match').filter({has:one.getByRole('heading',{name:title,exact:true})})
  await history.getByRole('button',{name:'Show details',exact:true}).click()
  await expect(one.getByText(/Rank 1 ·/)).toBeVisible()
  await one.getByRole('button',{name:'Review attempt',exact:true}).click()
  await expect(one.getByRole('dialog')).toContainText('Campus')
  await host.getByRole('button',{name:'Match details & history',exact:true}).click();await host.getByRole('button',{name:'Withdraw student review',exact:true}).click()
  await expect(one.getByRole('dialog').getByRole('alert')).toContainText('withdrawn')
  await expect(one.getByRole('dialog').getByText('Campus',{exact:true})).toHaveCount(0)
  console.log('PASS real three-context host arena: direct invitations, host re-entry, manual start, offline countdown reset, pause/resume, dual read-only views, HP, centered victory/defeat, reload, knockout, review withdrawal and desktop/phone.')
} finally {await writeFile(join(output,'safe-presence-timeline.json'),JSON.stringify(diagnostics,null,2));await bounded(browser.close(),'Browser cleanup').catch(error=>console.log(error.message))}
