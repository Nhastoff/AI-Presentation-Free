const { runSession } = require('./rea-session-client.cjs');
const fs = require('node:fs/promises');
const path = require('node:path');
// queue.json supports adaptive focused followups without importing the DLL again.
// Each job is {name,args,filename}; a final {name:'STOP',filename:'stop'} closes.
runSession({directory:'research/oart-analysis', target:'C:/Program Files (x86)/Microsoft Office/Office12/oart.dll', heap:'3G', startupTimeoutMs:1800000},async({tool,save,directory})=>{
  const bytes=await fs.readFile('C:/Program Files (x86)/Microsoft Office/Office12/oart.dll');
  const candidates=[];
  for(const encoding of ['latin1','utf16le']){
    for(const match of bytes.toString(encoding).matchAll(/[ -~]{5,}/g)){
      if(/group|ungroup|align|distribut|rotat|flip|crop|connector/i.test(match[0])&&match[0].length<180)
        candidates.push({encoding,fileOffset:match.index*(encoding==='utf16le'?2:1),value:match[0]});
    }
  }
  await fs.writeFile(path.join(directory,'raw-feature-candidates.json'),JSON.stringify({method:'Supplementary raw byte printable-run scan; candidates only, not semantic findings or Ghidra-defined strings',sha256:require('node:crypto').createHash('sha256').update(bytes).digest('hex'),candidates},null,2));
  await tool('binary_overview',{},'overview');
  await tool('binary_session',{},'session');
  await tool('search_strings',{mode:'regex',case_sensitive:false,pattern:'group|ungroup|align|distribut|rotat|flip|crop|connector|table|chart|drawing'},'feature-strings');
  await tool('search_procedures',{mode:'regex',case_sensitive:false,pattern:'group|align|distribut|rotat|flip|crop|connector|table|chart|drawing'},'feature-procedures');
  await save();
  for(const name of ['ChChartSpaceDelete','ChChartSpaceGimme','CreateChartClientData','GetChartObject','HrGetChAxis','HrSetDefaultChart','SetOMHost','GetEnumObjectForBobj']){
    await tool('analyze_function',{procedure:name},'function-'+name,{allowError:true});
  }
  await save();
  console.log('READY FOR FOLLOWUP QUEUE');
  const seen = new Set();
  const deadline = Date.now()+1800000;
  while(Date.now()<deadline){
    let queue=[]; try{queue=JSON.parse(await fs.readFile(path.join(directory,'queue.json'),'utf8'));}catch{}
    for(const job of queue){
      if(seen.has(job.filename))continue;
      seen.add(job.filename);
      if(job.name==='STOP'){await save();return;}
      await tool(job.name,job.args,job.filename,{allowError:true});
      await save();
    }
    await new Promise(resolve=>setTimeout(resolve,1000));
  }
}).catch(error=>{console.error(error.stack);process.exitCode=1;});
