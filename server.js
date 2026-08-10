const express=require('express');
const cors=require('cors');
const path=require('path');
const multer=require('multer');
const {parsePdfBuffer}=require('./pdf-parser');
const {upsertRecords,findByRoll,count}=require('./database');

const app=express();
const PORT=process.env.PORT||3000;
const ADMIN_KEY=process.env.ADMIN_KEY||'change-this-key';

const upload=multer({
 storage:multer.memoryStorage(),
 limits:{fileSize:50*1024*1024},
 fileFilter:(req,file,cb)=>{
   const ok=file.mimetype==='application/pdf'||file.originalname.toLowerCase().endsWith('.pdf');
   cb(ok?null:new Error('Only PDF files are allowed.'),ok);
 }
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname,'public')));

app.post('/api/result',(req,res)=>{
 const roll=String(req.body?.roll||'').trim();
 if(!/^\d{6}$/.test(roll)) return res.status(400).json({found:false,message:'Enter a valid 6-digit Roll number.'});
 const r=findByRoll(roll);
 if(!r) return res.status(404).json({found:false,message:'No result found.'});
 r.ref_subjects=r.ref_subjects?r.ref_subjects.split(',').map(x=>x.trim()).filter(Boolean):[];
 res.json({found:true,result:r});
});

app.post('/api/admin/import-pdf',upload.single('pdf'),async(req,res)=>{
 try {
   if(req.get('x-admin-key')!==ADMIN_KEY) return res.status(401).json({ok:false,message:'Invalid admin key.'});
   if(!req.file) return res.status(400).json({ok:false,message:'PDF file required.'});
   const parsed=await parsePdfBuffer(req.file.buffer,p=>{
     if(p.page===1||p.page===p.totalPages||p.page%25===0)
       console.log(`PDF import: page ${p.page}/${p.totalPages}, records ${p.records}`);
   });
   const imported=upsertRecords(parsed.records,req.file.originalname);
   res.json({ok:true,message:'PDF imported successfully.',pages:parsed.pages,records:imported,databaseRecords:count()});
 } catch(e) {
   console.error('PDF import error:',e);
   res.status(500).json({ok:false,message:e.message||'PDF import failed.'});
 }
});

app.get('/api/health',(req,res)=>res.json({ok:true,records:count()}));

app.listen(PORT,()=>console.log(`Result portal running at http://localhost:${PORT}`));
