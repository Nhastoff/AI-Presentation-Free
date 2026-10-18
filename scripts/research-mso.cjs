const {runSession}=require('./rea-session-client.cjs');
const fs=require('node:fs/promises');
const path=require('node:path');
const target='C:/Program Files (x86)/Common Files/Microsoft Shared/OFFICE12/MSO.dll';
runSession({directory:'research/mso-analysis',target,heap:'3G',startupTimeoutMs:1800000},async({tool,save,directory})=>{
  await tool('binary_overview',{},'overview');
  await tool('binary_session',{},'session');
  await tool('search_procedures',{pattern:'Ribbon|Toolbar|Command|Cmd|Clip|Undo|Control|Custom|Dispatch',mode:'regex',case_sensitive:false},'named-command-procedures');
  await tool('search_strings',{pattern:'IRibbon|customUI|idMso|CommandBars|Clipboard|Undo|onAction|TabHome|GetCustomUI|ExecuteMso',mode:'regex',case_sensitive:false},'command-strings');
  await save();
  const leads=[['create-toolbar','0x3263ad74'],['load-toolbar','0x326693a2'],['create-control','0x326428b2'],['activate-control','0x32f1036b'],['toolbar-metrics','0x33270b65'],['handled-message','0x3261b7ee'],['window-procedure','0x326408a9'],['window-procedure-needed','0x3261614f'],['make-custom-item','0x3270ae5a'],['button-size','0x3263b22e']];
  for(const [label,procedure] of leads){await tool('analyze_function',{procedure},'function-'+label,{allowError:true});await save();}
  await fs.writeFile(path.join(directory,'lead-selection.json'),JSON.stringify({method:'Exact MSO export RVA + ImageBase from dependency-bindings.json; export names are leads only',leads},null,2));
}).catch(e=>{console.error(e.stack);process.exitCode=1;});
