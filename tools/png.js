const fs=require('fs'),z=require('zlib');
function read(f){const b=fs.readFileSync(f);let p=8,W,H,bd,ct,plte,trns,id=[];
 while(p<b.length){const l=b.readUInt32BE(p),t=b.toString('latin1',p+4,p+8),d=b.subarray(p+8,p+8+l);p+=12+l;
  if(t=='IHDR'){W=d.readUInt32BE(0);H=d.readUInt32BE(4);bd=d[8];ct=d[9]}
  if(t=='PLTE')plte=d;if(t=='tRNS')trns=d;if(t=='IDAT')id.push(d)}
 const raw=z.inflateSync(Buffer.concat(id));const bpp=ct==3?1:ct==6?4:3;const st=W*bpp;const out=Buffer.alloc(H*st);
 if(ct==3&&bd!=8)throw'bd'+bd;
 for(let y=0;y<H;y++){const f=raw[y*(st+1)];for(let x=0;x<st;x++){let v=raw[y*(st+1)+1+x];const a=x>=bpp?out[y*st+x-bpp]:0,c=y?out[(y-1)*st+x]:0,d=(x>=bpp&&y)?out[(y-1)*st+x-bpp]:0;
  if(f==1)v+=a;else if(f==2)v+=c;else if(f==3)v+=(a+c)>>1;else if(f==4){const pp=a+c-d,pa=Math.abs(pp-a),pb=Math.abs(pp-c),pc=Math.abs(pp-d);v+=pa<=pb&&pa<=pc?a:pb<=pc?c:d}
  out[y*st+x]=v&255}}
 const px=new Uint8Array(W*H*4);for(let i=0;i<W*H;i++){if(ct==3){const k=out[i];px[i*4]=plte[k*3];px[i*4+1]=plte[k*3+1];px[i*4+2]=plte[k*3+2];px[i*4+3]=trns&&k<trns.length?trns[k]:255}else{for(let c=0;c<3;c++)px[i*4+c]=out[i*bpp+c];px[i*4+3]=ct==6?out[i*4+3]:255}}
 return{W,H,px}}
function write(f,W,H,px){const crcT=[];for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;crcT[n]=c>>>0}
 const crc=b=>{let c=~0;for(const x of b)c=crcT[(c^x)&255]^(c>>>8);return(~c)>>>0};
 const ch=(t,d)=>{const h=Buffer.alloc(4);h.writeUInt32BE(d.length);const td=Buffer.concat([Buffer.from(t,'latin1'),d]);const e=Buffer.alloc(4);e.writeUInt32BE(crc(td));return Buffer.concat([h,td,e])};
 const ih=Buffer.alloc(13);ih.writeUInt32BE(W,0);ih.writeUInt32BE(H,4);ih[8]=8;ih[9]=6;
 const raw=Buffer.alloc(H*(W*4+1));for(let y=0;y<H;y++){Buffer.from(px.buffer,px.byteOffset+y*W*4,W*4).copy(raw,y*(W*4+1)+1)}
 fs.writeFileSync(f,Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),ch('IHDR',ih),ch('IDAT',z.deflateSync(raw)),ch('IEND',Buffer.alloc(0))]))}
module.exports={read,write};
