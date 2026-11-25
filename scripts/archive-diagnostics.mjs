import {archiveDiagnosticSnapshot} from "../src/core/diagnostic-archive.mjs";
const [inputPath,directory,...rest]=process.argv.slice(2);
if(!inputPath||!directory||rest.length){console.error("Usage: node scripts/archive-diagnostics.mjs <export.json> <private-directory>");process.exitCode=2;}
else try{console.log(JSON.stringify(await archiveDiagnosticSnapshot({inputPath,directory}),null,2));}
catch(e){console.error("Diagnostic archive rejected");process.exitCode=1;}
