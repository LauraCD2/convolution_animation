// sketch.js — Convolución 2D interactiva (p5.js) [ref]
// Mantiene tu layout y añade montaje del canvas en #slot-in y swap a #slot-out. [web:120]

let img, outImg;
let kernel = [[0,-1,0],[-1,5,-1],[0,-1,0]];
let kSize = 3;
let stride = 1;
let paddingMode = 'valid'; // 'valid' o 'same'
let speed = 6; // celdas por frame
let playing = true;
let normMode = 'clip 0–255';
let scan = {x:0, y:0};
// Dos canvas independientes, uno para entrada y otro para salida
let inputCanvas, outputCanvas;

const presets = {
  'Identity': [[0,0,0],[0,1,0],[0,0,0]],
  'Blur 3×3 (Gauss)': [[1,2,1],[2,4,2],[1,2,1]].map(r=>r.map(v=>v/16)),
  'Sharpen': [[0,-1,0],[-1,5,-1],[0,-1,0]],
  'Edge (Laplaciano)': [[-1,-1,-1],[-1,8,-1],[-1,-1,-1]],
  'Sobel X': [[-1,0,1],[-2,0,2],[-1,0,1]],
  'Sobel Y': [[-1,-2,-1],[0,0,0],[1,2,1]],
  'Box 5×5': Array.from({length:5},()=>Array.from({length:5},()=>1/25)),
}; // Colección de kernels usada en demos y referencia de p5. [web:3]

function preload(){
  // Carga assets/input.png; si no existe, genera patrón sintético. [web:62]
  img = loadImage('assets/input.png', ()=>{}, ()=>{
    img = createImage(192,192);
    img.loadPixels();
    for(let y=0;y<img.height;y++){
      for(let x=0;x<img.width;x++){
        const v = ((x*7) ^ (y*11)) & 255;
        const i = 4*(x+y*img.width);
        img.pixels[i]=v; img.pixels[i+1]=v; img.pixels[i+2]=v; img.pixels[i+3]=255;
      }
    }
    img.updatePixels();
  });
} // Patrón de carga recomendado en la guía de inicio p5. [web:62]

function setup(){
  pixelDensity(1);
  const scaleFactor = 5;
  const W = img.width * scaleFactor;
  const H = img.height * scaleFactor;
  // Canvas para entrada
  inputCanvas = createCanvas(W, H);
  inputCanvas.parent('slot-in');
  // Canvas para salida (canvas HTML, no p5)
  outputCanvas = document.createElement('canvas');
  outputCanvas.width = W;
  outputCanvas.height = H;
  outputCanvas.style.display = 'block';
  const slotOut = document.getElementById('slot-out');
  if (slotOut && !slotOut.querySelector('canvas')) {
    slotOut.appendChild(outputCanvas);
  }
  textFont('system-ui'); textSize(12);
  initGUI();
  rebuildOutput();
}

function draw(){
  // Dibuja la entrada en el canvas principal
  background('#0f0f14');
  const scaleFactor = 5;
  image(img, 0, 0, img.width * scaleFactor, img.height * scaleFactor);
  drawOverlay();

  // Dibuja la salida en el canvas de salida (canvas HTML)
  const ctx = outputCanvas.getContext('2d');
  ctx.fillStyle = '#0f0f14';
  ctx.fillRect(0, 0, outputCanvas.width, outputCanvas.height);
  // Crea un p5.Graphics temporal para convertir outImg a imagen HTML
  let tempG = createGraphics(img.width * scaleFactor, img.height * scaleFactor);
  tempG.image(outImg, 0, 0, img.width * scaleFactor, img.height * scaleFactor);
  ctx.drawImage(tempG.canvas, 0, 0);
  tempG.remove();
  ctx.strokeStyle = 'rgba(255,160,160,1)';
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, img.width * scaleFactor, img.height * scaleFactor);

  if(playing){
    for(let s=0;s<speed;s++) stepScan();
  }

  // Actualiza relleno visual de sliders (CSS var --pct)
  document.querySelectorAll('#gui input[type=range]').forEach(r=>{
    const pct = 100*(r.value - r.min)/(r.max - r.min);
    r.style.setProperty('--pct', pct + '%');
  });
}

function stepScan(){
  const pad = (paddingMode==='same') ? Math.floor(kSize/2) : 0;
  const inX = scan.x*stride - pad;
  const inY = scan.y*stride - pad;
  const v = convolveAt(inX, inY);

  outImg.loadPixels();
  const idx = 4*(scan.x + scan.y*outImg.width);
  outImg.pixels[idx]=v; outImg.pixels[idx+1]=v; outImg.pixels[idx+2]=v; outImg.pixels[idx+3]=255;
  outImg.updatePixels();

  scan.x++;
  if(scan.x>=outImg.width){ scan.x=0; scan.y++; }
  if(scan.y>=outImg.height){ scan.x=0; scan.y=0; }
} // Escritura pixel a pixel con updatePixels como documenta p5. [web:73]

function convolveAt(inX, inY){
  img.loadPixels();
  let accR=0, accG=0, accB=0;
  const off = Math.floor(kSize/2);
  for(let ky=0; ky<kSize; ky++){
    for(let kx=0; kx<kSize; kx++){
      const x = inX + (kx - off);
      const y = inY + (ky - off);
      let r=0,g=0,b=0;
      if(x>=0 && x<img.width && y>=0 && y<img.height){
        const p = 4*(x + y*img.width);
        r = img.pixels[p]; g = img.pixels[p+1]; b = img.pixels[p+2];
      }
      const w = kernel[ky][kx];
      accR += r*w; accG += g*w; accB += b*w;
    }
  }
  const lum = 0.2126*accR + 0.7152*accG + 0.0722*accB;
  if(normMode==='clip 0–255'){
    return constrain(Math.round(lum), 0, 255);
  }else if(normMode==='map [-M,M]→[0,255]'){
    const M = 255 * sumAbsKernel();
    return constrain(Math.round(map(lum, -M, M, 0, 255)), 0, 255);
  }else{
    return constrain(Math.round(Math.min(Math.abs(lum),255)), 0, 255);
  }
} // Núcleo de convolución alineado con el ejemplo oficial de p5. [web:3]

function rebuildOutput(){
  const pad = (paddingMode==='same') ? Math.floor(kSize/2) : 0;
  const outW = Math.floor((img.width - kSize + 2*pad)/stride) + 1;
  const outH = Math.floor((img.height - kSize + 2*pad)/stride) + 1;
  outImg = createImage(outW, outH);
  outImg.loadPixels();
  for(let i=0;i<outImg.pixels.length;i+=4){
    outImg.pixels[i]=0; outImg.pixels[i+1]=0; outImg.pixels[i+2]=0; outImg.pixels[i+3]=255;
  }
  outImg.updatePixels();
  scan.x=0; scan.y=0;
} // Fórmula estándar de salida floor((n−k+2p)/s)+1. [web:26]

function drawOverlay(){
  // Overlay con mismo factor de escala que la imagen
  const scaleFactor = 5;
  const pad = (paddingMode==='same') ? Math.floor(kSize/2) : 0;
  const inX = scan.x*stride - pad;
  const inY = scan.y*stride - pad;
  const px = (inX - Math.floor(kSize/2)) * scaleFactor;
  const py = (inY - Math.floor(kSize/2)) * scaleFactor;
  noFill(); stroke(255,220);
  rect(px, py, kSize * scaleFactor, kSize * scaleFactor);
  stroke(255,90);
  for(let i=1;i<kSize;i++){
    line(px+i*scaleFactor,py,px+i*scaleFactor,py+kSize*scaleFactor);
    line(px,py+i*scaleFactor,px+kSize*scaleFactor,py+i*scaleFactor);
  }
} // Dibujo alineado con escalado manual manteniendo coherencia visual. [web:67]

function sumAbsKernel(){ return kernel.flat().reduce((s,w)=>s+Math.abs(w),0); }
function makeZeroKernel(k){ return Array.from({length:k},()=>Array.from({length:k},()=>0)); }
function setKernel(K){ kernel = K.map(r=>r.slice()); kSize = kernel.length; }

function initGUI(){
  const $ = s => document.querySelector(s);

  // Presets
  const preset = $('#preset');
  Object.keys(presets).forEach(n=> preset.add(new Option(n,n)));
  preset.value = 'Sharpen';
  preset.onchange = ()=>{ setKernel(presets[preset.value]); buildKernelGrid(); rebuildOutput(); };

  // k
  const kEl = $('#kSize'), kVal = kEl.nextElementSibling;
  kVal.textContent = kEl.value;
  kEl.oninput = ()=>{ kVal.textContent = kEl.value; setKernel(makeZeroKernel(parseInt(kEl.value))); buildKernelGrid(); rebuildOutput(); };

  // stride
  const sEl = $('#stride'), sVal = sEl.nextElementSibling;
  sVal.textContent = sEl.value;
  sEl.oninput = ()=>{ sVal.textContent = sEl.value; stride = parseInt(sEl.value); rebuildOutput(); };

  // padding
  const pEl = $('#padding');
  pEl.value = paddingMode;
  pEl.onchange = ()=>{ paddingMode = pEl.value; rebuildOutput(); };

  // speed
  const spEl = $('#speed'), spVal = spEl.nextElementSibling;
  spVal.textContent = spEl.value;
  spEl.oninput = ()=>{ spVal.textContent = spEl.value; speed = parseInt(spEl.value); };

  // normalización
  const nEl = $('#norm');
  nEl.value = normMode;
  nEl.onchange = ()=>{ normMode = nEl.value; };

  // botones
  $('#play').onclick = ()=> playing = !playing;
  $('#reset').onclick = ()=> { scan.x=0; scan.y=0; rebuildOutput(); };

  // El botón swap ha sido eliminado del DOM

  // grid inicial
  buildKernelGrid();
} // Posicionamiento del canvas en el DOM siguiendo la guía de p5. [web:120]

function buildKernelGrid(){
  const grid = document.getElementById('kernelGrid');
  grid.style.gridTemplateColumns = `repeat(${kSize}, 1fr)`;
  grid.innerHTML = '';
  for(let r=0;r<kSize;r++){
    for(let c=0;c<kSize;c++){
      const inp = document.createElement('input');
      inp.type = 'number'; inp.step = '0.1';
      inp.value = kernel[r][c];
      inp.oninput = ()=>{ kernel[r][c] = parseFloat(inp.value || 0); };
      grid.appendChild(inp);
    }
  }
} // Tabla editable en DOM nativo, integrada al panel. [web:55]
