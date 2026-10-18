// Focused read-only PPCORE Ribbon/command routing investigation.
const {runSession}=require('./rea-session-client.cjs');
const fs=require('node:fs/promises');const path=require('node:path');
const seeded=process.argv.includes('--seeded');
if(seeded) process.env.REA_GHIDRA_SEED_FILE=path.resolve('research/ppcore-commands/seeds.tsv');
runSession({directory:seeded?'research/ppcore-commands/seeded':'research/ppcore-commands',target:'C:/Program Files (x86)/Microsoft Office/Office12/PPCORE.DLL',heap:'2G'},async({tool,save,directory})=>{
 await tool('binary_overview',{},'overview');
 if(seeded){
  await tool('analyze_function',{procedure:'0x30154814'},'art-edit-command-dispatch');
  for(const [name,address]of [['align','0x3080ac14'],['distribute','0x3080af78'],['group','0x3080b068'],['ungroup','0x3080b6ac'],['regroup','0x3080b1a4']])await tool('xrefs',{address},'xrefs-'+name);
  await save();
 }else{
 const seeds=[['ribbon','0x3010c434'],['align-type','0x3080ac14'],['distribute-type','0x3080af78'],['group-type','0x3080b068'],['ungroup-type','0x3080b6ac'],['regroup-type','0x3080b1a4']];
 for(const [name,address]of seeds)await tool('xrefs',{address},'xrefs-'+name);
 for(const [name,address]of [['ribbon-registration','0x3010c399'],['align-table','0x30154880'],['distribute-table','0x301548ac'],['group-table','0x30154924']]){
  await tool('resolve_containing_procedure',{address},'owner-'+name);
 }
 await save();
 }
 // Follow-up request file permits adapting to observed facts without reopening Ghidra.
 await fs.writeFile(path.join(directory,'ready'),'ready');
 let n=0;let stop=false;
 while(!stop&&n<120){
  const request=path.join(directory,'requests.json');
  try{const actions=JSON.parse(await fs.readFile(request,'utf8'));await fs.unlink(request);
   for(const a of actions){if(a.stop){stop=true;break;}await tool(a.name,a.args,a.file,{allowError:true});}await save();
  }catch(error){if(error.code!=='ENOENT')throw error;await new Promise(r=>setTimeout(r,5000));n++;}
 }
}).catch(e=>{console.error(e.stack);process.exitCode=1;});
