const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.mjs');

const clean = v => String(v || '').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim();
const subjects = v => clean(v).match(/\d{5}\([TP](?:,[TP])*\)/g) || [];

function parsePageText(text, year) {
 const out = new Map();
 const t = clean(text);

 const pass = /(\d{6})\s*\(\s*gpa3:\s*(ref|\d+(?:\.\d+)?)\s*,\s*gpa2:\s*(ref|\d+(?:\.\d+)?)\s*,\s*gpa1:\s*(ref|\d+(?:\.\d+)?)\s*\)/gi;
 for (const m of t.matchAll(pass))
   out.set(m[1],{roll:m[1],examYear:year,gpa3:m[2].toLowerCase(),gpa2:m[3].toLowerCase(),gpa1:m[4].toLowerCase(),refSubjects:[],status:'PASS'});

 const ref = /(\d{6})\s*\{\s*gpa3:\s*(ref|\d+(?:\.\d+)?)\s*,\s*gpa2:\s*(ref|\d+(?:\.\d+)?)\s*,\s*gpa1:\s*(ref|\d+(?:\.\d+)?)\s*,\s*ref_sub:\s*([^}]+)\}/gi;
 for (const m of t.matchAll(ref))
   out.set(m[1],{roll:m[1],examYear:year,gpa3:m[2].toLowerCase(),gpa2:m[3].toLowerCase(),gpa1:m[4].toLowerCase(),refSubjects:subjects(m[5]),status:'REFERRED'});

 const fail = /(\d{6})\s*\{\s*((?:\d{5}\([TP](?:,[TP])*\)\s*,?\s*){2,})\}/gi;
 for (const m of t.matchAll(fail))
   if (!out.has(m[1])) out.set(m[1],{roll:m[1],examYear:year,gpa1:'',gpa2:'',gpa3:'',refSubjects:subjects(m[2]),status:'FAIL'});

 const exp = /(\d{6})\s*\(\s*Expelled_sub\s*-\s*([^;)]*)\s*;\s*reffered_sub\s*-\s*([^)]*)\)/gi;
 for (const m of t.matchAll(exp))
   out.set(m[1],{roll:m[1],examYear:year,gpa1:'',gpa2:'',gpa3:'',refSubjects:[clean(m[2]),...subjects(m[3])].filter(Boolean),status:'EXPELLED'});

 return [...out.values()];
}

async function parsePdfBuffer(buffer, onProgress) {
 const task = pdfjsLib.getDocument({data:new Uint8Array(buffer),useWorkerFetch:false,isEvalSupported:false,verbosity:0});
 const pdf = await task.promise;
 const all = new Map();
 let year = '';
 for (let pageNo=1; pageNo<=pdf.numPages; pageNo++) {
   const page = await pdf.getPage(pageNo);
   const c = await page.getTextContent();
   const text = c.items.map(x=>x.str||'').join(' ');
   if (!year) {
     const m = text.match(/DIPLOMA IN ENGINEERING,\s*(\d{4})/i);
     if (m) year=m[1];
   }
   for (const r of parsePageText(text,year)) all.set(r.roll,r);
   page.cleanup();
   if (onProgress) await onProgress({page:pageNo,totalPages:pdf.numPages,records:all.size});
 }
 if (!all.size) throw new Error('No recognizable result records were found in the PDF.');
 return {records:[...all.values()],pages:pdf.numPages};
}
module.exports = {parsePdfBuffer};
